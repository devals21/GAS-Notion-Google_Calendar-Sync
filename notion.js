//============================================================//
//                    NOTION - READ PAGES                     //
//============================================================//

function getNotionPages() {
  let lastSync = PropertiesService.getUserProperties().getProperty("LNGU");

  let url = getDatabaseURL();
  let payload = {
    archived: true,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }]
  };

  if (!lastSync) {
    payload["filter"] = {
      and: [
        {
          property: DATE_NOTION,
          date: {
            on_or_after: Utils.getRelativeDate(-RELATIVE_MIN_DATE).toISOString()
          }
        },
        {
          property: DATE_NOTION,
          date: {
            on_or_before: Utils.getRelativeDate(RELATIVE_MAX_DATE).toISOString()
          }
        },
        {
          property: IGNORE_NOTION,
          checkbox: {
            equals: false
          },
        },
      ]
    }
  }
  else {
    payload["filter"] = {
      and: [
        {
          timestamp: "last_edited_time",
          last_edited_time: {
            on_or_after: lastSync
          }
        },
        {
          property: DATE_NOTION,
          date: {
            is_not_empty: true
          }
        },
        {
          property: EDITED_BY_NOTION,
          last_edited_by: {
            does_not_contain: Utils.splitIntegrationId(NOTION_INTEGRATION_ID)
          }
        },
        {
          property: IGNORE_NOTION,
          checkbox: {
            equals: false
          },
        },
      ]
    }
  }

  let response = notionFetch(url, payload, "POST");
  if (response.results.length > 0) {
    Logger.log("Processing %s pages found from Notion", response.results.length.toString());
  }
  else {
    Logger.log("No pages found to process from Notion");
  }

  let newTime = new Date();
  newTime.setMinutes(newTime.getMinutes() - 5);
  response.results.lngu = newTime.toISOString();

  return response.results;
}

//============================================================//


//============================================================//
//                     NOTION - GET PAGE                      //
//============================================================//

/**
 * Determine if a page exists for the event, and the page needs to be updated. 
 * Returns page response if found.
 * 
 * @param {CalendarEvent} event
 * @returns {*} Page response if found.
 */
function getPageFromEvent(event) {
  let url = getDatabaseURL();
  let payload = {
    filter: {
      and: [
        {
          property: EVENT_ID_NOTION,
          rich_text: { equals: event.id }
        },
        {
          property: IGNORE_NOTION,
          checkbox: { equals: false }
        }
      ]
    },
  };

  let response_data = notionFetch(url, payload, "POST");

  if (response_data.results.length > 0) {
    if (response_data.results.length > 1) {
      Logger.log(
        `WARNING: Found multiple entries with event id %s. 
        This should not happen. Only considering index zero entry.`,
        event.id
      );
    }

    return response_data.results[0];
  }
  return false;
}

//============================================================//


//============================================================//
//                    NOTION - CREATE PAGE                    //
//============================================================//

/**
 * Create a new database entry for the event
 * 
 * @param {CalendarEvent} event modified GCal event object
 * @returns {*} request object
 */
function createDatabaseEntry(event, multi = false) {
  let url = "https://api.notion.com/v1/pages";
  let payload = {};

  payload["parent"] = {
    type: "database_id",
    database_id: DATABASE_ID,
  };

  payload["properties"] = convertToNotionProperty(event);
  payload["icon"] = setNotionIcon();

  if (multi) {
    return {
      method: "POST",
      url: url,
      headers: getNotionHeaders(),
      muteHttpExceptions: true,
      payload: JSON.stringify(payload),
    }
  }
  else {
    return notionFetch(url, payload, "POST");
  }
}

//============================================================//


//============================================================//
//                    NOTION - UPDATE PAGE                    //
//============================================================//

/**
 * Update database entry with new event information
 * 
 * @param {CalendarEvent} event Modified Google calendar event
 * @param {String} pageId Page ID of database entry
 * @param {Boolean} multi Whenever or not the update is meant for a multi-fetch
 * @returns {*} request object if multi is true, fetch response if multi is false
 */
function updateDatabaseEntry(event, pageId, multi = true) {
  let properties = convertToNotionProperty(event);

  return pushDatabaseUpdate(properties, pageId, multi);
}
/**
 * Push update to notion database for page
 * 
 * @param {Object} properties
 * @param {String} pageId page id to update
 * @param {Boolean} archive whenever or not to archive the page
 * @param {Boolean} multi whenever or not to use single fetch, 
 *    or return options for fetchAll
 * @returns {*} request object if multi, otherwise URL fetch response
 */
function pushDatabaseUpdate(
  properties,
  pageId,
  multi = false
) {
  let url = "https://api.notion.com/v1/pages/" + pageId;
  let payload = {};
  payload["properties"] = properties;
  payload["icon"] = setNotionIcon();

  let options = {
    method: "PATCH",
    headers: getNotionHeaders(),
    muteHttpExceptions: true,
    payload: JSON.stringify(payload),
  };

  if (multi) {
    options["url"] = url;
    return options;
  }

  return UrlFetchApp.fetch(url, options);
}

//============================================================//


//============================================================//
//                    NOTION - DELETE PAGE                    //
//============================================================//

function setPageArchived(id) {
  let url = "https://api.notion.com/v1/pages/" + id;
  let payload = {};

  payload["properties"] = {
    [ARCHIVED_NOTION]: { checkbox: true }
  }

  let options = {
    url: url,
    method: "PATCH",
    muteHttpExceptions: true,
    headers: getNotionHeaders(),
    payload: JSON.stringify(payload)
  };
  return options;
}

//============================================================//


//============================================================//
//                   NOTION - CONVERT PAGE                    //
//============================================================//

/**
 * Return notion JSON property object based on event data
 * 
 * @param {CalendarEvent} event modified GCal event object
 * @param {String[]} existing_tags - existing tags to add to event
 * @returns {Object} notion property object
 */
function convertToNotionProperty(event) {
  let properties = getBaseNotionProperties(event.id, event.calendarId);
  let name = event.summary ? createNotionTitle(event.summary) : "";

  properties[ARCHIVED_NOTION] = {
    checkbox: event.status == "cancelled"
  };
  properties[DESCRIPTION_NOTION] = {
    type: "rich_text",
    rich_text: [
      {
        text: {
          content: event.description?.trim() || "",
        },
      },
    ],
  };
  if (event.htmlLink) {
    properties[EVENT_LINK_NOTION] = {
      url: event.htmlLink
    };
  }
  properties[LOCATION_NOTION] = {
    type: "rich_text",
    rich_text: [
      {
        text: {
          content: event.location || "",
        },
      },
    ],
  };

  if (event.start) {
    let start_time;
    let end_time;

    if (event.start.date) {
      // All-day event.
      start_time = new Date(Date.parse(event.start.date + "T00:00:00"));
      end_time = new Date(Date.parse(event.end.date + "T00:00:00"));
      end_time.setMinutes(end_time.getMinutes() - 1);

      end_time = start_time === end_time ? null : end_time;
    } else {
      // Events that don't last all day; they have defined start times.
      start_time = new Date(event.start.dateTime);
      end_time = new Date(event.end.dateTime);
    }

    properties[DATE_NOTION] = {
      type: "date",
      date: {
        start: Utils.getFormattedDateString(start_time),
        end: Utils.getFormattedDateString(end_time),
        time_zone: Session.getScriptTimeZone()
      },
    };

    properties[NAME_NOTION] = {
      type: "title",
      title: [
        {
          type: "text",
          text: {
            content: name,
          },
        },
      ],
    };
  }

  return properties;
}

/**
 * Return base notion JSON property object including generation time
 * @param {String} eventId - event ID
 * @param {String} calendarId - calendar key ID
 * @returns {Object} - base notion property object
 *  */
function getBaseNotionProperties(eventId, calendarId) {
  return {
    [EVENT_ID_NOTION]: {
      type: "rich_text",
      rich_text: [
        {
          text: {
            content: eventId,
          },
        },
      ],
    },
    [CALENDAR_ID_NOTION]: {
      select: {
        name: getDefaultCalendarId(calendarId),
      },
    },
    [CALENDAR_NAME_NOTION]: {
      select: {
        name: CalendarApp.getCalendarById(calendarId).getName(),
      },
    },
  };
}

//============================================================//

//============================================================//
//                       NOTION - UTILS                       //
//============================================================//

/**
 * Interact with notion API
 * 
 * @param {String} url - url to send request to
 * @param {Object} payload_dict - payload to send with request
 * @param {String} method - method to use for request
 * @returns {Object} request response object
 */
function notionFetch(url, payload_dict, method = "POST") {
  // UrlFetchApp is sync even if async is specified
  let options = {
    method: method,
    headers: getNotionHeaders(),
    muteHttpExceptions: true,
    ...(payload_dict && { payload: JSON.stringify(payload_dict) }),
  };

  let response = UrlFetchApp.fetch(url, options);

  if (response.getResponseCode() === 200) {
    let response_data = JSON.parse(response.getContentText());
    if (response_data.length == 0) {
      throw new Error(
        "No data returned from Notion API. Check your Notion token."
      );
    }
    return response_data;
  } else if (response.getResponseCode() === 401) {
    throw new Error("Notion token is invalid.");
  } else {
    throw new Error(response.getContentText());
  }
}

function getNotionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    Accept: "application/json",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

function getDatabaseURL() {
  return `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;
}

function getNotionParent() {
  return {
    database_id: DATABASE_ID,
  };
}

function createNotionTitle(text) {
  text = removeDoneInTitle(text);
  return text.trim();
}

function setNotionIcon() {
  return {
    type: "external", external:
      { url: `https://api.iconify.design/tabler/bell-filled.svg?download=1&color=white&width=256&height=256` }
  }
}

//============================================================//
