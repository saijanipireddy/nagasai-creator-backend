import mongoose from 'mongoose';

const practiceQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  options: [{
    type: String,
    required: true
  }],
  answer: {
    type: Number,
    required: true
  }
});

// Image link schema for coding practice resources
const imageLinkSchema = new mongoose.Schema({
  label: {
    type: String,
    default: ''
  },
  url: {
    type: String,
    required: true
  }
});

// Coding Practice schema with language support
const codingPracticeSchema = new mongoose.Schema({
  language: {
    type: String,
    enum: ['html', 'css', 'javascript', 'python', 'java', 'cpp', 'c', 'typescript', 'sql', 'php', 'ruby', 'go', 'rust', 'kotlin', 'swift'],
    default: 'javascript'
  },
  title: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  referenceImage: {
    type: String,
    default: ''
  },
  imageLinks: [imageLinkSchema],
  starterCode: {
    type: String,
    default: ''
  },
  expectedOutput: {
    type: String,
    default: ''
  },
  hints: [{
    type: String
  }]
});

const topicSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Topic title is required'],
    trim: true
  },
  order: {
    type: Number,
    default: 0
  },
  videoUrl: {
    type: String,
    default: ''
  },
  pdfUrl: {
    type: String,
    default: ''
  },
  practice: [practiceQuestionSchema],
  codingPractice: codingPracticeSchema,
  isPublished: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster queries
topicSchema.index({ courseId: 1, order: 1 });

const Topic = mongoose.model('Topic', topicSchema);

export default Topic;
