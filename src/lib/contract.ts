/** API contract version for health + future commands. */
export const LOCATIONS_API_CONTRACT_VERSION = "0.1.0";

export type LocationsHealthResponse = {
  ok: true;
  service: "chatiq-locations";
  contract_version: string;
  persistence: "none" | "mock" | "supabase";
};
