#!/usr/bin/env node
// Promote a player to admin (or back): node scripts/make-admin.js <phone-or-email> [user]
// Run from server/ with DATABASE_URL set (locally: it reads server/.env).
import 'dotenv/config';
import { q, pool } from '../src/db/pool.js';
const [who, role = 'admin'] = process.argv.slice(2);
if (!who) { console.error('usage: node scripts/make-admin.js <phone-or-email> [admin|user]'); process.exit(1); }
const digits = who.replace(/\D/g, '').replace(/^(234|233)/, '').replace(/^0/, '');
const { rows } = await q(`UPDATE users SET role=$2 WHERE email ILIKE $1 OR phone=$3 RETURNING uid, country, phone, email, role`, [who, role, digits]);
console.log(rows.length ? rows : 'no such user');
await pool.end();
