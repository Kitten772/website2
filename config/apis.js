import pg from "pg";
import nodemailer from "nodemailer";
import { appConfig } from "./config.js";
import { Stripe } from "stripe";
import Dockerode from "dockerode";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Feature flags
 */
export const dbEnabled = Boolean(appConfig.db);
export const stripeEnabled = dbEnabled && "stripe" in appConfig;
export const nowpaymentsEnabled = dbEnabled && "nowpayments" in appConfig;
export const accountsEnabled = stripeEnabled || nowpaymentsEnabled;
export const userSystemEnabled = dbEnabled;

export const theatreAdminSignupEnabled =
  dbEnabled && appConfig.theatre?.adminSignupEnabled === true;

export const theatrePlayCountingEnabled =
  dbEnabled && appConfig.theatre?.playCountingEnabled !== false;

export const discordEnabled = accountsEnabled && "discord" in appConfig;

export const discordListening =
  discordEnabled && appConfig.discord?.listenForJoins === true;

export const hcaptchaEnabled = accountsEnabled && "hcaptcha" in appConfig;

/**
 * Theatre file path (optional)
 */
export const theatreFilesEnabled = Boolean(appConfig.theatre?.filesPath);

export const theatreFilesPath = theatreFilesEnabled
  ? resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      appConfig.theatre.filesPath,
    )
  : undefined;


 
 import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

export const db = DATABASE_URL
  ? new pg.Client({ connectionString: DATABASE_URL })
  : null;

/**
 * Stripe
 */
export const stripe = stripeEnabled
  ? new Stripe(appConfig.stripe.secret)
  : null;

/**
 * Docker
 */
export const docker = accountsEnabled
  ? new Dockerode(appConfig.docker)
  : null;

/**
 * Mailer
 */
export const mailer = accountsEnabled
  ? nodemailer.createTransport(appConfig.mailer.transport)
  : null;

/**
 * Prevent accidental access when disabled
 */
if (!accountsEnabled) {
  const traps = {};

  for (const prop of ["stripe", "docker", "mailer", "discord"]) {
    traps[prop] = {
      enumerable: false,
      get: () => {
        throw new TypeError(
          `Tried to access ${prop}, but accounts system is disabled.`,
        );
      },
    };
  }

  Object.defineProperties(appConfig, traps);
}

/**
 * Discord role sync
 */
export async function giveTierDiscordRoles(user) {
  if (!appConfig.discord) return false;

  const roleIds = [appConfig.discord.roleIds.premium];

  const isPremium = Date.now() < user.paid_until.getTime();

  for (const roleId of roleIds) {
    console.log(
      isPremium ? "Giving" : "Taking",
      "role",
      roleId,
      "to",
      user.discord_id,
      "guild",
      appConfig.discord.guildId,
    );

    const res = await fetch(
      `https://discord.com/api/v10/guilds/${appConfig.discord.guildId}/members/${user.discord_id}/roles/${roleId}`,
      {
        method: isPremium ? "PUT" : "DELETE",
        headers: {
          authorization: `Bot ${appConfig.discord.botToken}`,
          "x-audit-log-reason": `${
            isPremium ? "Subscribed" : "Unsubscribed"
          } premium (${user.id})`,
        },
      },
    );

    if (res.status !== 204) {
      if (res.status === 404) return false;

      console.error("Error giving role:", res.status, res.statusText);
      throw new Error(await res.text());
    }
  }

  return true;
}
