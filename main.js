const userProperties = PropertiesService.getUserProperties();
const lock = LockService.getScriptLock();

const withEmojis = /\p{Extended_Pictographic}/u;
const notEmojis = /[\p{Alphabetic}\p{Decimal_Number}\p{Connector_Punctuation} ]/u;

function main(ev = { calendarId: CALENDAR_IDS[0] }) { // Change the number to debug each Calendar
  let updatedEvents;
  let updatedPages;

  Logger.log("-- Finished processing items | Starting sync --");
  Logger.log("-----------------------------------------------");

  try {
    updatedEvents = getCalendarEvents(ev);

    Logger.log("Syncing %s events from Google Calendar", updatedEvents?.length.toString());

    if (updatedEvents?.length > 0) syncFromCalendar(updatedEvents);
    lock.waitLock(30000);
    userProperties.setProperty("ST" + ev.calendarId, updatedEvents?.st);
    lock.releaseLock();
    Logger.log("Sync finished without errors!");
  }
  catch (err) {
    Logger.log(err.message.toUpperCase());
    userProperties.deleteProperty("ST" + ev.calendarId);
  }

  try {
    updatedPages = getNotionPages();
    Logger.log("Syncing %s pages from Notion", updatedPages?.length.toString());

    if (updatedPages.length > 0) syncFromNotion(updatedPages);
    lock.waitLock(30000);
    userProperties.setProperty("LNGU", updatedPages.lngu);
    lock.releaseLock();
    Logger.log("Sync finished without errors!");
  }
  catch (e) {
    Logger.log(e.message.toUpperCase());
    userProperties.deleteProperty("LNGU");
  }
}

function deleteUserProperties() {
  userProperties.deleteAllProperties();
}

//---GET UPDATED EVENTS FROM CALENDAR TO SYNC IN NOTION---
function syncFromCalendar(events) {
  let requests = [];

  for (let i = 1; i <= events.length; i++) {
    let event = events[i - 1];

    event["start_time"] = event.start?.date || event.start?.dateTime;

    if (event.status == "cancelled") {
      Logger.log("Syncing event %s deleted | ID: %s | Name: %s | Date: %s",
        i.toString(), event.id, event.summary || "UNNAMED",
        new Date(event.start?.date || event.start?.dateTime).toLocaleString(LOCALE_STRING));
      requests = requests.concat(deleteSyncedEvent(event));
    }
    else {
      Logger.log("Syncing event %s created or updated | ID: %s | Name: %s | Date: %s",
        i.toString(), event.id, event.summary || "UNNAMED",
        new Date(event.start.date || event.start.dateTime).toLocaleString(LOCALE_STRING));
      requests = requests.concat(updateSyncedEvent(event));

    }
  }

  UrlFetchApp.fetchAll(requests);
}

function deleteSyncedEvent(event) {
  let requests = [];
  let page = getPageFromEvent(event);
  if (page) {
    Logger.log("... Found associated Notion page, attemping to set as ARCHIVED");
    requests.push(setPageArchived(page.id));
  }
  else {
    Logger.log("... Not found associated Notion page, skipping delete");
  }

  return requests;
}

function updateSyncedEvent(event) {
  let requests = [];
  let notBirthday = event.calendarId != getBirthDaysCalendarId();

  let page = getPageFromEvent(event);
  if (page) {
    Logger.log("... Found associated Notion page, attemping update");
    event["notion_url"] = page.url;
    requests.push(updateDatabaseEntry(event, page.id));
  }
  else {
    Logger.log("... Not found associated Notion page, creating new");
    requests.push(createDatabaseEntry(event, true));
  }

  return requests;
}

//---GET UPDATED PAGES FROM NOTION TO SYNC IN MICROSOFT AND CALENDAR---
function syncFromNotion(pages) {
  let requests = [];

  for (let i = 1; i <= pages.length; i++) {
    let page = pages[i - 1];
    let start = new Date(page.properties[DATE_NOTION].date?.start);
    let name = Utils.flattenRichText(page.properties[NAME_NOTION].title);
    name = name == "" ? "UNNAMED" : name;

    if (page.properties[ARCHIVED_NOTION].checkbox == true) {
      Logger.log("Syncing Notion page %s deleted | URL: %s | Name: %s | Date: %s",
        i.toString(), page.url, name, start.toLocaleString(LOCALE_STRING));
      requests = requests.concat(deleteSyncedPage(page));
    }
    else {
      Logger.log("Syncing Notion page %s created or updated | URL: %s | Name: %s | Date: %s",
        i.toString(), page.url, name, start.toLocaleString(LOCALE_STRING));
      requests = requests.concat(updateSyncedPage(page));
    }
  }

  UrlFetchApp.fetchAll(requests);
}

function deleteSyncedPage(page) {
  let requests = [];

  let calendarId = page.properties[CALENDAR_ID_NOTION].select?.name || "";
  let eventId = Utils.flattenRichText(page.properties[EVENT_ID_NOTION].rich_text);

  try {
    let event = Calendar.Events.get(calendarId, eventId);
    event.status = "cancelled";
    event.extendedProperties = { private: { GAS: new Date().toISOString() } };
    Calendar.Events.update(event, calendarId, event.id);
  }
  catch (e) {
    Logger.log("... Not found associated Calendar Event, skipping delete");
  }

  return requests;
}

function updateSyncedPage(page) {
  let requests = [];

  let calendarId = page.properties[CALENDAR_ID_NOTION].select?.name || "";
  let calendarName = page.properties[CALENDAR_NAME_NOTION].select?.name;

  if (calendarId != getBirthDaysCalendarId()) {
    let event = convertToGCalEvent(page);
    let sourceCal = CalendarApp.getCalendarsByName(calendarName)[0];
    let sourceCalId = Session.getActiveUser().getEmail() == sourceCal?.getId() ? "primary" : sourceCal?.getId();

    if (sourceCal && calendarId && event.id) {
      if (calendarId == sourceCalId) {
        // Update event in original calendar.
        Logger.log("... Found associated Calendar event [same Calendar ID], attemping update");
        event.extendedProperties = { private: { GAS: new Date().toISOString() } };
        try {
          Calendar.Events.update(event, calendarId, event.id);
        }
        catch {
          requests.push(setPageArchived(page.id));
        }
      } else {
        // Event being moved to a new calendar - is deleted from old calendar and create in new [Notion page only update]
        Logger.log("... Found associated Calendar event [another Calendar ID], attemping move to " + calendarName);
        try {
          Calendar.Events.move(calendarId, event.id, sourceCalId);
        }
        catch {
          requests.push(setPageArchived(page.id));
        }

        event["calendarId"] = sourceCalId;
        requests.push(updateDatabaseEntry(event, page.id));
        Logger.log("... Updating Notion page associated to set Calendar Event ID and URL");
      }
    } else {
      // Attempt to create in primary calendar
      calendarId = sourceCal ? sourceCalId : "primary";
      event.id = "";
      Logger.log("... Not found associated Calendar event, attemping create to " + (calendarName || "default calendar"));
      event.extendedProperties = { private: { GAS: new Date().toISOString() } };
      try {
        event = Calendar.Events.insert(event, calendarId);
      }
      catch {
        requests.push(setPageArchived(page.id));
      }

      event["calendarId"] = calendarId;
      requests.push(updateDatabaseEntry(event, page.id));
      Logger.log("... Updating Notion page associated to set Calendar Event ID and URL");
    }
  }
  else {
    Logger.log("... Skiping update [Birthday reminder] | Calendar ID not support updates");
  }

  return requests;
}
