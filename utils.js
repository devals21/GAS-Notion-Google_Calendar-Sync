class Utils {

  /**
   * Generates a String formatted for the given date at the given timezone
   * 
   * @param {Date} date
   * @param {String} timezone (script timezone by default)
   * @returns String of formatted date
   */
  static getFormattedDateString(date, timezone = Session.getScriptTimeZone()) {
    return Utilities.formatDate(date, timezone, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  /**
   * Generates a relative date from now by adding or subtracting days
   * 
   * @param {Number} daysOffset days to add and subtract from today's date
   * @param {Number} hour (specifies the hour for the resulting date, 00 by default)
   * @returns Date rerelative result
   */
  static getRelativeDate(daysOffset, hour = 0) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    date.setHours(hour);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  }

  /**
   * Flattens rich text properties into a singular string.
   * 
   * @param {Object} rich_text_result - Rich text property to flatten
   * @return {String} - Flattened rich text
   */
  static flattenRichText(rich_text_result) {
    let plain_text = "";
    for (let i = 0; i < rich_text_result.length; i++) {
      plain_text += rich_text_result[i].rich_text
        ? rich_text_result[i].rich_text.plain_text
        : rich_text_result[i].plain_text;
    }
    return plain_text;
  }

  /**
   * Determine whether the given `input` is iterable.
   *
   * @returns {Boolean}
   */
  static isIterable(input) {
    if (input === null || input === undefined) {
      return false;
    }
    return typeof input[Symbol.iterator] === "function";
  }

  /**
   * Determine whether the given `input` is iterable.
   *
   * @param {Object} rich_text_result - Rich text property to flatten
   * @param {Object} rich_text_result - Rich text property to flatten
   * @param {Object} rich_text_result - Rich text property to flatten
   * @returns {Boolean}
   */
  static regexIndexOf(string, regex, startpos = 0) {
    const indexOf = string.substring(startpos || 0).search(regex);
    return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
  }

  /**
   * Returns a hyphenated String from a Notion Integration 'id' input
   *
   * @returns {String}
   */
  static splitIntegrationId(id) {
    return id.substring(0, 8)
      + "-" + id.substring(8, 12)
      + "-" + id.substring(12, 16)
      + "-" + id.substring(16, 20)
      + "-" + id.substring(20);
  }

  /**
   * Generates an id based on the actual date and a random number
   *
   * @returns {String}
   */
  static generateId() {
    return Date.now().toString(36)
      + Math.random().toString(36).slice(2);
  }
}

/**
 * Returns the birthdays google calendar id
 *
 * @returns {String}
 */
function getBirthDaysCalendarId() {
  return "addressbook#contacts@group.v.calendar.google.com";
}

/**
 * Returns 'primary' if google calendar id input is the user email
 *
 * @param {String}
 * @returns {String}
 */
function getDefaultCalendarId(id) {
  return id == Session.getActiveUser().getEmail() ? "primary" : id;
}

function setDoneInTitle(text) {
  text = removeDoneInTitle(text);

  let icon = Utils.regexIndexOf(text, withEmojis) == 0 ?
    text.substring(0, Utils.regexIndexOf(text, notEmojis)).trim() : null;

  text = Utils.regexIndexOf(text, withEmojis) == 0 ?
    text.substring(Utils.regexIndexOf(text, notEmojis)).trim() : text;

  let iconSpace = icon ? icon + " " : "";

  return "✔ " + iconSpace + text.split("").reduce((acc, char) =>
    acc + char + "\u0335", "");
}

function removeDoneInTitle(text) {
  return text.replace("✔", "").replace("✓", "").replace(/[\u0335]/g, "").trim();
}
