import { Setting } from '../models/Setting.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
  Object.assign(settings, req.body);
  normalizeSettings(settings);
  await settings.save();
  res.json({ settings });
});
