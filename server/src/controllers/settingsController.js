import { Setting } from '../models/Setting.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

function normalizeSettings(settings) {
  if (!settings) return settings;
  const symbol = String(settings.currencySymbol || '').trim();
  if (!symbol || symbol === 'â‚¹' || symbol === '&#8377;') {
    settings.currencySymbol = '₹';
  }
  return settings;
}

async function getSingleton() {
  let settings = await Setting.findOne();
  if (!settings) settings = await Setting.create({});
  return normalizeSettings(settings);
}

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await getSingleton();
  res.json({ settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getSingleton();
  const previous = settings.toObject();
  Object.assign(settings, req.body);
  normalizeSettings(settings);
  await settings.save();
  await logAudit(req, { action: 'Settings Changes', module: 'Settings', previousValue: previous, newValue: settings.toObject() });
  res.json({ settings });
});
