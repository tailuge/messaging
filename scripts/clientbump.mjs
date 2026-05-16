#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const file = 'src/client/utils.js';
const src = readFileSync(file, 'utf8');
const match = src.match(/export const CLIENTVERSION = (\d+);/);
if (!match) { console.error('CLIENTVERSION not found'); process.exit(1); }

const next = parseInt(match[1]) + 1;
writeFileSync(file, src.replace(match[0], `export const CLIENTVERSION = ${next};`));
console.log(`CLIENTVERSION: ${match[1]} → ${next} (v${Math.floor(next/100)}.${String(next%100).padStart(2,'0')})`);
