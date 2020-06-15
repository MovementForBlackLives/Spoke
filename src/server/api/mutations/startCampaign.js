import cacheableData from "../../models/cacheable_queries";
import { r } from "../../models";
import { accessRequired } from "../errors";
import { Notifications, sendUserNotification } from "../../notifications";
import { loadCampaignCache, startCampaignAsync } from "../../../workers/jobs";
import twilio from "../lib/twilio";
import { getConfig } from "../lib/config";
import { jobRunner } from "../../../integrations/job-runners";

export const startCampaign = async (
  _,
  { id },
  { user, loaders, remainingMilliseconds }
) => {
  const campaign = await cacheableData.campaign.load(id);
  await accessRequired(user, campaign.organization_id, "ADMIN");
  const organization = await loaders.organization.load(
    campaign.organization_id
  );

  if (
    getConfig("EXPERIMENTAL_CAMPAIGN_PHONE_NUMBERS", null, {
      truthy: true
    })
  ) {
    // Transferring numbers in twilio can take a long time, so start campaign becomes a job
    await r.knex.transaction(async trx => {
      // TODO: get this working on SQLite?
      // prevent duplicate start jobs for the same campaign
      await trx.raw("LOCK TABLE job_request IN EXCLUSIVE MODE");
      const existing = await trx("job_request")
        .select("*")
        .where({ campaign_id: id, job_type: "start_campaign" })
        .first();
      if (existing) {
        throw new Error("Duplicate start campaign job");
      }
      // NOTE: long-running transaction with 'legacy' runner if run with JOBS_SYNC
      return await jobRunner.dispatch(
        {
          queue_name: `${id}:start_campaign`,
          job_type: "start_campaign",
          locks_queue: false,
          campaign_id: id,
          payload: JSON.stringify({})
        },
        { trx }
      );
    });

    return await cacheableData.campaign.load(id, {
      forceLoad: true
    });
  }

  if (campaign.use_own_messaging_service) {
    if (!campaign.messageservice_sid) {
      const friendlyName = `Campaign: ${campaign.title} (${campaign.id}) [${process.env.BASE_URL}]`;
      const messagingService = await twilio.createMessagingService(
        organization,
        friendlyName
      );
      campaign.messageservice_sid = messagingService.sid;
    }
  } else {
    campaign.messageservice_sid = await cacheableData.organization.getMessageServiceSid(
      organization
    );
  }

  campaign.is_started = true;

  await campaign.save();
  await sendUserNotification({
    type: Notifications.CAMPAIGN_STARTED,
    campaignId: id
  });

  const campaignRefreshed = await cacheableData.campaign.load(id, {
    forceLoad: true
  });

  // some asynchronous cache-priming:
  await loadCampaignCache(campaignRefreshed, organization, {
    remainingMilliseconds
  });
  return campaignRefreshed;
};
