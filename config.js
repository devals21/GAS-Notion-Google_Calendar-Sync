//============================================================//
//                      GLOBAL SETTINGS                       //
//============================================================//

const LOCALE_STRING = "es-ES";

// Relative to the time of last full sync in days
// **ALERT**: Modify these settings at your own risk, you may exceed the free GAS quotas
const RELATIVE_MAX_DATE = 7; // 1 week
const RELATIVE_MIN_DATE = 2; // 2 days

//============================================================//

//============================================================//
//                SETTINGS FOR GOOGLE CALENDAR                //
//============================================================//

const CALENDAR_IDS = [
  "primary", // Primary Local-181
  getBirthDaysCalendarId(), // Birthdays
  // Add all the calendar IDs you want to sync
];

//============================================================//


//============================================================//
//                    SETTINGS FOR NOTION                     //
//============================================================//

const DATABASE_ID = ""; // Notion Database ID
const NOTION_TOKEN = ""; // Notion token 
const NOTION_INTEGRATION_ID = ""; // Notion Integration ID

// Name of your Notion Database Properties
const NAME_NOTION = "Name";
const DONE_NOTION = "Done";
const DATE_NOTION = "Date";
const DESCRIPTION_NOTION = "Description";
const CALENDAR_NAME_NOTION = "Calendar Name";
const EVENT_LINK_NOTION = "Event link";
const IGNORE_NOTION = "Ignore Sync";
const ARCHIVED_NOTION = "Archived";
const LOCATION_NOTION = "Location";
const EVENT_ID_NOTION = "event_id";
const CALENDAR_ID_NOTION = "calendar_id";
const EDITED_BY_NOTION = "last_edited_by";

//============================================================//
