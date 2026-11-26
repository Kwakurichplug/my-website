// The payment APIs for Ghana Mobile Money. New payments use the active one: Moolre when its keys are set, otherwise
// Paystack when PAYSTACK_SECRET_KEY is set, otherwise none (manual MoMo, confirmed by an admin). A payment always stays
// with the provider it started on (payments.provider), so switching providers never strands one.
import * as moolre from './moolre.js';
import * as paystack from './paystack.js';

const ALL = { moolre, paystack };
export const API_PROVIDERS = Object.keys(ALL);
export const isApi = provider => API_PROVIDERS.includes(provider);
export const byName = provider => ALL[provider] || null;
export const active = () => (moolre.enabled() ? moolre : paystack.enabled() ? paystack : null);
export const enabled = () => !!active();
