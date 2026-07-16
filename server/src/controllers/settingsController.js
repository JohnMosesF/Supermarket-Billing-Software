import { Setting } from '../models/Setting.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';
import { ApiError } from '../utils/apiError.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const phonePattern = /^[0-9+\-\s]{7,15}$/;

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
  if (req.body.email && !emailPattern.test(req.body.email)) throw new ApiError(400, 'Invalid email');
  if (req.body.gstNumber && !gstPattern.test(req.body.gstNumber)) throw new ApiError(400, 'Invalid GST number');
  if (req.body.panNumber && !panPattern.test(req.body.panNumber)) throw new ApiError(400, 'Invalid PAN number');
  if (req.body.phone && !phonePattern.test(req.body.phone)) throw new ApiError(400, 'Invalid phone number');
  if (req.body.mobile && !phonePattern.test(req.body.mobile)) throw new ApiError(400, 'Invalid mobile number');
  const settings = await getSingleton();
  const previous = settings.toObject();
  Object.assign(settings, req.body);
  normalizeSettings(settings);
  await settings.save();
  await logAudit(req, { action: 'Settings Changes', module: 'Settings', previousValue: previous, newValue: settings.toObject() });
  res.json({ settings });
});
