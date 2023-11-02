const userProperties = PropertiesService.getUserProperties();
const lock = LockService.getScriptLock();

function main(ev = { calendarId: "primary" }) {
  let updatedEvents;
  try {
    updatedEvents = getCalendarEvents(ev);

    Logger.log("-- Finished processing items | Starting sync --");
    Logger.log("-----------------------------------------------");

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
}

function deleteUserProperties() {
  userProperties.deleteAllProperties();
}

//---GET UPDATED EVENTS FROM CALENDAR TO SYNC IN MICROSOFT AND NOTION---
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
  let notBirthday = event.calendar_id != getBirthDaysCalendarId();

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
