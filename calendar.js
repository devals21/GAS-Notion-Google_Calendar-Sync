//============================================================//
//               GOOGLE CALENDAR - READ EVENTS                //
//============================================================//

function getCalendarEvents(ev, fullSync = false) {
  const calendarId = ev.calendarId;
  const calendarName = CalendarApp.getCalendarById(calendarId).getName();

  const eventsToSync = [];
  const eventsRepeated = new Set();

  lock.waitLock(30000);
  const syncToken = userProperties.getProperty("ST" + calendarId);
  lock.releaseLock();

  const options = {
    maxResults: 2500,
    singleEvents: true, // allow recurring events
    showDeleted: !!syncToken
  };

  if (syncToken && !fullSync) {
    options.syncToken = syncToken;
  } else {
    // Sync events up to x days in the past.
    options.timeMin = Utils.getRelativeDate(-RELATIVE_MIN_DATE).toISOString();
    // Sync events up to x days in the future.
    options.timeMax = Utils.getRelativeDate(RELATIVE_MAX_DATE).toISOString();
  }

  // Retrieve events one page at a time.
  let events;
  try {
    events = Calendar.Events.list(calendarId, options);
  } catch (err) {
    // Check to see if the sync token was invalidated by the server;
    // if so, perform a full sync instead.
    if (
      err.message.includes("full sync is required")
    ) {
      userProperties.deleteProperty("ST" + calendarId);
      getCalendarEvents(ev, true);
      return;
    } else {
      throw new Error(err.message);
    }
  }


  Logger.log("%s events detected from Calendar | %s",
    events.items.length.toString(), calendarName);

  if (events.items && events.items.length === 0) {
    Logger.log("No events found to process from Calendar | " + calendarName);
  }
  else {

    // Filter events for a short enough sync
    if (events.items.length > 30) {
      events.items = events.items.filter(event => {
        const start = new Date(event.start?.date || event.start?.dateTime);
        return start >= Utils.getRelativeDate(-7)
          && start <= Utils.getRelativeDate(30);
      })
    }
    const eventsSet = new Set(events.items);

    for (let event of eventsSet) {
      event["calendarName"] = calendarName;
      event["calendarId"] = calendarId;
      const gas = syncToken ? event.extendedProperties?.private["GAS"] : null;
      const diffTime = Math.abs(new Date(gas) - new Date(event.updated));

      // Don't sync recently updated events via GAS
      if (!gas || diffTime > 2500) {
        if (!eventsRepeated.has(event.id + event.calendarId)) {
          eventsToSync.push(event);
          eventsRepeated.add(event.id + event.calendarId);
        }
      }
    }

    Logger.log("Processing %s events found from Calendar | %s",
      eventsToSync.length.toString(), calendarName);
  }

  eventsToSync.st = events.nextSyncToken;
  return eventsToSync;
}

//============================================================//

/**
 * Return GCal event object based on page properties
 * @param {Object} page - Notion page result object
 * @returns {Object} - GCal event object Return False if required properties not found
 */
function convertToGCalEvent(page) {
  let e_id = page.properties[EVENT_ID_NOTION].rich_text;
  e_id = Utils.flattenRichText(e_id);

  let e_summary = page.properties[NAME_NOTION].title;
  e_summary = removeDoneInTitle(Utils.flattenRichText(e_summary));
  e_summary = e_summary == "" ? "UNNAMED" : e_summary;

  if (page.properties[DONE_NOTION].checkbox == true) e_summary = setDoneInTitle(e_summary);

  let e_description = createEventDescription(page);

  let e_location = page.properties[LOCATION_NOTION].rich_text;
  e_location = Utils.flattenRichText(e_location);

  let dates = page.properties[DATE_NOTION];

  if (dates.date) {
    let all_day = dates.date.end === null;
    let default_end;

    if (dates.date.start && dates.date.start.search(/([A-Z])/g) === -1) {
      dates.date.start += "T00:00:00";
      all_day = true;

      default_end = new Date(dates.date.start);
      default_end.setDate(default_end.getDate() + 1);
      dates.date.end = default_end.toISOString();
    } else if (
      !dates.date.end &&
      dates.date.start &&
      dates.date.start.search(/([A-Z])/g) !== -1
    ) {
      all_day = false;
      default_end = new Date(dates.date.start);
      default_end.setMinutes(default_end.getMinutes() + 30);

      dates.date.end = default_end.toISOString();
    } else if (dates.date.end && dates.date.end.search(/([A-Z])/g) === -1) {
      dates.date.end += "T00:00:00";
      all_day = true;
    }

    let start = all_day ? { date: dates.date.start, timeZone: Session.getScriptTimeZone() } : { dateTime: dates.date.start, timeZone: Session.getScriptTimeZone() };
    let end = all_day ? { date: dates.date.end, timeZone: Session.getScriptTimeZone() } : { dateTime: dates.date.end, timeZone: Session.getScriptTimeZone() };

    let event = {
      ...(e_id && { id: e_id }),
      ...(e_summary && { summary: e_summary }),
      ...(e_description && { description: e_description }),
      ...(e_location && { location: e_location }),
      ...(dates.date.start && { start: start }),
      ...(dates.date.end && { end: end }),
      all_day: all_day,
    };

    return event;
  } else {
    return false;
  }
}


function createEventDescription(page) {
  return "Description: "
    .concat(Utils.flattenRichText(page.properties[DESCRIPTION_NOTION].rich_text))
    .concat("\nNotion-Link: ")
    .concat(page.url)
}
