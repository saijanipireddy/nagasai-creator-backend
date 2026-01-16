import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Course name is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required']
  },
  icon: {
    type: String,
    default: 'FaBook'
  },
  color: {
    type: String,
    default: '#e94560'
  },
  order: {
    type: Number,
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for topics
courseSchema.virtual('topics', {
  ref: 'Topic',
  localField: '_id',
  foreignField: 'courseId'
});

// Virtual for topic count
courseSchema.virtual('totalTopics', {
  ref: 'Topic',
  localField: '_id',
  foreignField: 'courseId',
  count: true
});

const Course = mongoose.model('Course', courseSchema);

export default Course;
