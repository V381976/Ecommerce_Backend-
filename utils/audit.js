const AuditLog = require("../models/AuditLogModel");

// record an admin action; never blocks or fails the request
const audit = (req, action, { entity, entityId, summary, meta } = {}) => {
  const admin = req.admin || {};
  AuditLog.create({
    actor: { id: admin._id || req.user?.id, name: admin.name, role: admin.role || req.user?.role },
    action,
    entity,
    entityId: entityId ? String(entityId) : undefined,
    summary,
    meta,
    ip: req.ip,
  }).catch((err) => console.error("audit log failed:", err.message));
};

module.exports = { audit };
