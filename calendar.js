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
