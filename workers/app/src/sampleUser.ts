import type { LinkAuthUser } from "link-auth";

export type SampleUser = Pick<
  LinkAuthUser,
  "avatar_url" | "discord_id" | "display_name"
>;
