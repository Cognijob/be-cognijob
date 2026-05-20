import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import WebSocket from "ws";
// @ts-ignore
global.WebSocket = WebSocket;
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});
