import fs from 'fs';
import path from 'path';

const migrationsDir = 'supabase/migrations';
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort(); // Lexicographical sort matches chronological YYYYMMDDHHMMSS format

console.log(`Found ${files.length} migration files.`);

let consolidated = `-- ==================================================================\n`;
consolidated += `-- PRIMACOR - CONSOLIDATED DATABASE SCHEMA\n`;
consolidated += `-- Generated for new Supabase project: zkpfuotxkdbokytqtjgj\n`;
consolidated += `-- Total migrations consolidated: ${files.length}\n`;
consolidated += `-- ==================================================================\n\n`;

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8').trim();
  consolidated += `-- ------------------------------------------------------------------\n`;
  consolidated += `-- Migration: ${file}\n`;
  consolidated += `-- ------------------------------------------------------------------\n`;
  consolidated += content + '\n\n';
}

fs.writeFileSync('supabase_complete_schema.sql', consolidated);
console.log(`Successfully generated supabase_complete_schema.sql (${(consolidated.length / 1024).toFixed(1)} KB)`);
