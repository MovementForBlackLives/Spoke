import { getConfig } from "../../../server/api/lib/config";
import { cacheableData } from "../../../server/models";

// Besides a bunch of horrible words, this includes "fakeslur" for easier testing.
// These defaults include offensive slurs but do not include e.g. "fu**" or "sh**"
// though they include some variants of those words -- the (default) goal is not to flag
// descriptive language, but hostile language.  This can be customized by an env or organization setting.
export const DEFAULT_PROFANITY_REGEX_BASE64 =
  "ZmFrZXNsdXJ8XGJhc3NcYnxhc3Nob2xlfGJpdGNofGJsb3dqb2J8YnJvd25pZXxjaGlua3xjb2NrfGNvb258Y3Vja3xjdW50fGRhcmt5fGRpY2toZWFkfFxiZGllXGJ8ZmFnZ290fGZhaXJ5fGZhcnR8ZnJpZ2lkfGZ1Y2tib3l8ZnVja2VyfGdvb2t8aGVlYnxcYmhvZVxifFxiaG9tb1xifGppZ2Fib298a2lrZXxra2t8a3Uga2x1eCBrbGFufGxpY2sgbXxtYWNhY2F8bW9sZXN0fG15IGRpY2t8bXkgYXNzfG5lZ3JvfG5pZ2dlcnxuaWdyYXxwZWRvfHBpc3N8cHJpY2t8cHVzc3l8cXVpbXxyYXBlfHJldGFyZHxzaGVlbmllfHNoaXRoZWFkfHNoeWxvY2t8c2h5c3RlcnxzbHV0fHNwaWN8c3Bpa3xzdWNrIG15fHRhY29oZWFkfHRpdHN8dG93ZWxoZWFkfHRyYW5uaWV8dHJhbm55fHR1cmR8dHdhdHx3YW5rfHdldGJhY2t8d2hvcmV8eWlk";

export const serverAdministratorInstructions = () => {
  return {
    description: `
      When inappropriate words are used by contacts or texters they
      can be automatically tagged for review.
    `,
    setupInstructions: `After deciding the Regular Expression to match profanity if you go to the node js
       shell and run
         Buffer.from("YOUR|BAD|WORD|REGEX|HERE").toString('base64')
       and set that in PROFANITY_REGEX_BASE64.
       Create either or both tags for contact and texter tagging (or they can be the same tag)
       and set the ids in the corresponding environment variable.
    `,
    environmentVariables: [
      "PROFANITY_CONTACT_TAG_ID",
      "PROFANITY_TEXTER_TAG_ID",
      "PROFANITY_REGEX_BASE64"
    ]
  };
};

// note this is NOT async
export const available = organization => {
  return (
    getConfig("EXPERIMENTAL_TAGS", organization) &&
    (getConfig("PROFANITY_CONTACT_TAG_ID", organization) ||
      getConfig("PROFANITY_TEXTER_TAG_ID", organization))
  );
};

// export const preMessageSave = async () => {};

export const postMessageSave = async ({ message, organization }) => {
  let tag_id = null;
  let regexText = null;
  if (message.is_from_contact) {
    tag_id = getConfig("PROFANITY_CONTACT_TAG_ID", organization);
    regexText =
      getConfig("PROFANITY_REGEX_BASE64", organization) ||
      DEFAULT_PROFANITY_REGEX_BASE64;
  } else {
    tag_id = getConfig("PROFANITY_TEXTER_TAG_ID", organization);
    regexText =
      getConfig("PROFANITY_TEXTER_REGEX_BASE64", organization) ||
      getConfig("PROFANITY_REGEX_BASE64", organization) ||
      DEFAULT_PROFANITY_REGEX_BASE64;
  }

  if (tag_id) {
    const re = new RegExp(Buffer.from(regexText, "base64").toString(), "i");
    if (String(message.text).match(re)) {
      await cacheableData.tagCampaignContact.save(message.campaign_contact_id, [
        { id: tag_id }
      ]);
    }
  }
};
