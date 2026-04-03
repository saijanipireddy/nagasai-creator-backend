import supabase from '../config/db.js';
import { handleError } from '../middleware/errorHandler.js';

const mapAnnouncement = (a) => ({
  _id: a.id,
  title: a.title,
  content: a.content,
  priority: a.priority,
  batchId: a.batch_id,
  createdBy: a.created_by,
  isActive: a.is_active,
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

// @desc    Get all announcements (admin)
// @route   GET /api/announcements
// @access  Private/Admin
export const getAnnouncements = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ announcements: (data || []).map(mapAnnouncement) });
  } catch (error) {
    handleError(res, error, 'announcementController');
  }
};

// @desc    Create announcement
// @route   POST /api/announcements
// @access  Private/Admin
export const createAnnouncement = async (req, res) => {
  try {
    const { title, content, priority, batchId } = req.body;

    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title,
        content,
        priority: priority || 'normal',
        batch_id: batchId || null,
        created_by: req.admin.id,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(mapAnnouncement(data));
  } catch (error) {
    handleError(res, error, 'announcementController');
  }
};

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin
export const updateAnnouncement = async (req, res) => {
  try {
    const { title, content, priority, isActive } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (priority !== undefined) updates.priority = priority;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error } = await supabase
      .from('announcements')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Announcement not found' });
    res.json(mapAnnouncement(data));
  } catch (error) {
    handleError(res, error, 'announcementController');
  }
};

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
export const deleteAnnouncement = async (req, res) => {
  try {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    handleError(res, error, 'announcementController');
  }
};

// @desc    Get announcements for student (their batches + global)
// @route   GET /api/announcements/student
// @access  Private/Student
export const getStudentAnnouncements = async (req, res) => {
  try {
    const studentId = req.student.id;

    // Get student's active batch IDs
    const { data: enrollments } = await supabase
      .from('student_batches')
      .select('batch_id')
      .eq('student_id', studentId)
      .eq('is_active', true);

    const batchIds = (enrollments || []).map(e => e.batch_id);

    // Get announcements: global (no batch_id) + student's batches
    let query = supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (batchIds.length > 0) {
      query = query.or(`batch_id.is.null,batch_id.in.(${batchIds.join(',')})`);
    } else {
      query = query.is('batch_id', null);
    }

    const { data: announcements, error } = await query;
    if (error) throw error;

    // Get read status
    const announcementIds = (announcements || []).map(a => a.id);
    let readIds = new Set();
    if (announcementIds.length > 0) {
      const { data: reads } = await supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('student_id', studentId)
        .in('announcement_id', announcementIds);
      readIds = new Set((reads || []).map(r => r.announcement_id));
    }

    const mapped = (announcements || []).map(a => ({
      ...mapAnnouncement(a),
      isRead: readIds.has(a.id),
    }));

    const unreadCount = mapped.filter(a => !a.isRead).length;

    res.json({ announcements: mapped, unreadCount });
  } catch (error) {
    handleError(res, error, 'announcementController');
  }
};

// @desc    Mark announcement as read
// @route   POST /api/announcements/:id/read
// @access  Private/Student
export const markAnnouncementRead = async (req, res) => {
  try {
    const { error } = await supabase
      .from('announcement_reads')
      .upsert(
        {
          announcement_id: req.params.id,
          student_id: req.student.id,
        },
        { onConflict: 'announcement_id,student_id', ignoreDuplicates: true }
      );

    if (error) throw error;
    res.json({ message: 'Marked as read' });
  } catch (error) {
    handleError(res, error, 'announcementController');
  }
};
