import { Setting } from './models/Setting.js';
import { User } from './models/User.js';

export async function ensureDefaultData() {
  const admin = await User.findOne({ email: 'admin@store.com' });
  if (!admin) {
    await User.create({
      name: 'Store Admin',
      email: 'admin@store.com',
      username: 'admin',
      password: 'Admin@12345',
      role: 'admin',
      permissions: []
    });
  } else if (!admin.username) {
    admin.username = 'admin';
    await admin.save();
  }

  const usersWithoutUsername = await User.find({ $or: [{ username: { $exists: false } }, { username: '' }] });
  for (const user of usersWithoutUsername) {
    const base = String(user.email || user.name || user._id).split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user';
    let candidate = base;
    let suffix = 1;
    while (await User.exists({ _id: { $ne: user._id }, username: candidate })) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    user.username = candidate;
    await user.save();
  }

  await Setting.findOneAndUpdate({}, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
}
