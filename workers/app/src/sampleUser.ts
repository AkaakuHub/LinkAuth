export type SampleUser = {
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  status: "active";
  icon_source?: "discord" | "r2" | "none";
  icon_key?: string;
};
