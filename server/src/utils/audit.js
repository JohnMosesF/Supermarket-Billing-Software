import { AuditLog } from '../models/AuditLog.js';

export async function logAudit(req, { action, module, previousValue = null, newValue = null, user = null }) {
  try {
    const actor = user || req.user;
    await AuditLog.create({
      user: actor?._id,
      userName: actor?.name || actor?.email,
      action,
      module,
      previousValue,
      newValue,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress
    });
  } catch (error) {
    console.error('Audit log failed', error);
  }
}
