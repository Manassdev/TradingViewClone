import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

const userIdsFor = (userId) => {
  const ids = [String(userId)];
  if (mongoose.Types.ObjectId.isValid(userId)) ids.push(new mongoose.Types.ObjectId(userId));
  return ids;
};

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const sendError = (res, operation, error) => {
  console.error(`[Notifications] ${operation} failed:`, error.message);
  return res.status(500).json({ success: false, message: 'Unable to process the notification request.' });
};

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: { $in: userIdsFor(req.user.id) } }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    return sendError(res, 'list', error);
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Notification ID is invalid.' });
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: { $in: userIdsFor(req.user.id) } },
      { $set: { isRead: true } },
      { new: true }
    ).lean();
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.json({ success: true, data: notification });
  } catch (error) {
    return sendError(res, 'mark read', error);
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany({ userId: { $in: userIdsFor(req.user.id) }, isRead: false }, { $set: { isRead: true } });
    return res.json({ success: true, updatedCount: result.modifiedCount });
  } catch (error) {
    return sendError(res, 'mark all read', error);
  }
};

export const deleteNotification = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Notification ID is invalid.' });
    const deleted = await Notification.findOneAndDelete({ _id: req.params.id, userId: { $in: userIdsFor(req.user.id) } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.json({ success: true, message: 'Notification deleted.' });
  } catch (error) {
    return sendError(res, 'delete', error);
  }
};
