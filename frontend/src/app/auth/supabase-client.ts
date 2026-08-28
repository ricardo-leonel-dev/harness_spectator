import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

export type Supabase = SupabaseClient;

export const SUPABASE_CLIENT = new InjectionToken<Supabase>('SUPABASE_CLIENT');

export function buildSupabaseClient(): Supabase {
  return createClient(environment.supabaseUrl, environment.supabaseAnonKey);
}
