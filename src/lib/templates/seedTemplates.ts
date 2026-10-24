export interface TemplateDefinition {
  id: string;
  title: string;
  description: string;
  category: string;
  isQuiz?: boolean;
  theme: {
    primaryColor: string;
    backgroundColor: string;
    cardColor: string;
    fontFamily: string;
    borderRadius: string;
  };
  sections: {
    title: string;
    description: string;
    orderIndex: number;
    questions: {
      title: string;
      description?: string;
      type: string;
      isRequired: boolean;
      orderIndex: number;
      validation?: any;
      config?: any;
      quizPoints?: number;
      quizAnswer?: any;
      quizExplanation?: string;
      options?: { label: string; value: string; orderIndex: number; isOther?: boolean; goToSectionId?: string | null }[];
    }[];
  }[];
}

export const FORM_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'contact-form',
    title: 'Contact Information',
    description: 'Please leave your details and we will get back to you shortly.',
    category: 'General',
    theme: {
      primaryColor: '#0284c7', // Sky Blue
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Personal Details',
        description: 'Provide your contact information so we can reach you.',
        orderIndex: 0,
        questions: [
          {
            title: 'Full Name',
            type: 'SHORT_ANSWER',
            isRequired: true,
            orderIndex: 0,
            validation: { minLength: 2, maxLength: 80 },
          },
          {
            title: 'Email Address',
            type: 'EMAIL',
            isRequired: true,
            orderIndex: 1,
          },
          {
            title: 'Phone Number',
            type: 'PHONE',
            isRequired: false,
            orderIndex: 2,
          },
          {
            title: 'How would you prefer to be contacted?',
            type: 'MULTIPLE_CHOICE',
            isRequired: true,
            orderIndex: 3,
            options: [
              { label: 'Email', value: 'email', orderIndex: 0 },
              { label: 'Phone Call', value: 'phone', orderIndex: 1 },
              { label: 'Text Message (SMS)', value: 'sms', orderIndex: 2 },
            ],
          },
          {
            title: 'Your Message / Inquiry',
            type: 'PARAGRAPH',
            isRequired: true,
            orderIndex: 4,
            validation: { minLength: 10, maxLength: 1000 },
          },
        ],
      },
    ],
  },
  {
    id: 'customer-feedback',
    title: 'Customer Satisfaction Survey',
    description: 'We value your honest feedback to improve our products and services.',
    category: 'Business',
    theme: {
      primaryColor: '#7c3aed', // Purple
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Your Experience',
        description: 'Tell us how satisfied you are with your recent interaction.',
        orderIndex: 0,
        questions: [
          {
            title: 'Overall satisfaction rating',
            description: '1 = Very Dissatisfied, 5 = Very Satisfied',
            type: 'LINEAR_SCALE',
            isRequired: true,
            orderIndex: 0,
            config: { scaleMin: 1, scaleMax: 5, scaleMinLabel: 'Very Dissatisfied', scaleMaxLabel: 'Very Satisfied' },
          },
          {
            title: 'Which features do you use the most?',
            type: 'CHECKBOXES',
            isRequired: true,
            orderIndex: 1,
            options: [
              { label: 'Fast Performance', value: 'performance', orderIndex: 0 },
              { label: 'Intuitive User Interface', value: 'ui', orderIndex: 1 },
              { label: 'Customer Support', value: 'support', orderIndex: 2 },
              { label: 'Reporting & Analytics', value: 'analytics', orderIndex: 3 },
              { label: 'Other', value: 'other', orderIndex: 4, isOther: true },
            ],
          },
          {
            title: 'How likely are you to recommend us to a colleague?',
            type: 'RATING',
            isRequired: true,
            orderIndex: 2,
            config: { ratingMax: 5, ratingIcon: 'STAR' },
          },
          {
            title: 'Service Aspect Evaluation',
            type: 'MULTIPLE_CHOICE_GRID',
            isRequired: false,
            orderIndex: 3,
            config: {
              rows: ['Ease of Use', 'Reliability', 'Value for Money', 'Speed'],
              cols: ['Poor', 'Fair', 'Good', 'Excellent'],
            },
          },
          {
            title: 'What could we do better?',
            type: 'PARAGRAPH',
            isRequired: false,
            orderIndex: 4,
          },
        ],
      },
    ],
  },
  {
    id: 'event-registration',
    title: 'Annual Tech Summit 2026 Registration',
    description: 'Join innovators, engineers, and tech leaders for 3 days of talks and workshops.',
    category: 'Events',
    theme: {
      primaryColor: '#059669', // Emerald
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-2xl',
    },
    sections: [
      {
        title: 'Attendee Information',
        description: 'Badge details and primary contact',
        orderIndex: 0,
        questions: [
          {
            title: 'Full Name',
            type: 'SHORT_ANSWER',
            isRequired: true,
            orderIndex: 0,
          },
          {
            title: 'Work Email',
            type: 'EMAIL',
            isRequired: true,
            orderIndex: 1,
          },
          {
            title: 'Company / Organization',
            type: 'SHORT_ANSWER',
            isRequired: true,
            orderIndex: 2,
          },
          {
            title: 'Pass Type',
            type: 'DROPDOWN',
            isRequired: true,
            orderIndex: 3,
            options: [
              { label: 'General Admission ($299)', value: 'ga', orderIndex: 0 },
              { label: 'VIP Pass with Speaker Dinner ($599)', value: 'vip', orderIndex: 1 },
              { label: 'Student / Academic ($99)', value: 'student', orderIndex: 2 },
            ],
          },
          {
            title: 'Dietary Restrictions',
            type: 'CHECKBOXES',
            isRequired: false,
            orderIndex: 4,
            options: [
              { label: 'Vegetarian', value: 'veg', orderIndex: 0 },
              { label: 'Vegan', value: 'vegan', orderIndex: 1 },
              { label: 'Gluten-free', value: 'gf', orderIndex: 2 },
              { label: 'Nut Allergy', value: 'nut', orderIndex: 3 },
              { label: 'None', value: 'none', orderIndex: 4 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'job-application',
    title: 'Software Engineer Application',
    description: 'We are looking for creative software engineers to build high-scale web products.',
    category: 'Hiring',
    theme: {
      primaryColor: '#2563eb', // Royal Blue
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Candidate Profile',
        description: 'Tell us about your background and qualifications.',
        orderIndex: 0,
        questions: [
          {
            title: 'Full Legal Name',
            type: 'SHORT_ANSWER',
            isRequired: true,
            orderIndex: 0,
          },
          {
            title: 'Email Address',
            type: 'EMAIL',
            isRequired: true,
            orderIndex: 1,
          },
          {
            title: 'LinkedIn / Portfolio URL',
            type: 'WEBSITE',
            isRequired: true,
            orderIndex: 2,
          },
          {
            title: 'Years of Professional Experience',
            type: 'NUMBER',
            isRequired: true,
            orderIndex: 3,
            validation: { minVal: 0, maxVal: 40 },
          },
          {
            title: 'Primary Expertise',
            type: 'CHECKBOXES',
            isRequired: true,
            orderIndex: 4,
            options: [
              { label: 'React & Next.js', value: 'react', orderIndex: 0 },
              { label: 'Node.js & TypeScript', value: 'node', orderIndex: 1 },
              { label: 'PostgreSQL & Database Architecture', value: 'postgres', orderIndex: 2 },
              { label: 'Cloud Infrastructure (AWS/GCP)', value: 'cloud', orderIndex: 3 },
            ],
          },
          {
            title: 'Resume / CV Document',
            type: 'FILE_UPLOAD',
            isRequired: true,
            orderIndex: 5,
            config: { maxFileSizeMb: 25, allowedFileTypes: [] },
          },
        ],
      },
    ],
  },
  {
    id: 'employee-survey',
    title: 'Employee Engagement & Culture Survey',
    description: 'Help us understand your workplace satisfaction and team dynamics.',
    category: 'HR',
    theme: {
      primaryColor: '#ea580c', // Orange
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Workplace Pulse',
        description: 'Your responses will be kept confidential.',
        orderIndex: 0,
        questions: [
          {
            title: 'Department',
            type: 'DROPDOWN',
            isRequired: true,
            orderIndex: 0,
            options: [
              { label: 'Engineering', value: 'eng', orderIndex: 0 },
              { label: 'Product & Design', value: 'prod', orderIndex: 1 },
              { label: 'Sales & Marketing', value: 'sales', orderIndex: 2 },
              { label: 'Operations & HR', value: 'ops', orderIndex: 3 },
            ],
          },
          {
            title: 'I feel valued for the work I contribute',
            type: 'LINEAR_SCALE',
            isRequired: true,
            orderIndex: 1,
            config: { scaleMin: 1, scaleMax: 5, scaleMinLabel: 'Strongly Disagree', scaleMaxLabel: 'Strongly Agree' },
          },
          {
            title: 'Work Environment Assessment',
            type: 'MULTIPLE_CHOICE_GRID',
            isRequired: true,
            orderIndex: 2,
            config: {
              rows: ['Work-Life Balance', 'Team Collaboration', 'Career Growth Opportunities', 'Leadership Transparency'],
              cols: ['Unsatisfactory', 'Needs Work', 'Good', 'Exceptional'],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'general-quiz',
    title: 'Web Engineering & Architecture Quiz',
    description: 'Test your knowledge on modern full-stack web architecture and database design.',
    category: 'Education',
    isQuiz: true,
    theme: {
      primaryColor: '#d97706', // Amber
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Frontend & Architecture Fundamentals',
        description: 'Answer all questions to compute your score.',
        orderIndex: 0,
        questions: [
          {
            title: 'What is the primary benefit of Server Components in Next.js App Router?',
            type: 'MULTIPLE_CHOICE',
            isRequired: true,
            orderIndex: 0,
            quizPoints: 10,
            quizAnswer: { correctValue: 'Zero bundle impact on client JS' },
            quizExplanation: 'Server Components execute on the server and do not add to the client bundle size.',
            options: [
              { label: 'They allow window and document access', value: 'window', orderIndex: 0 },
              { label: 'Zero bundle impact on client JS', value: 'Zero bundle impact on client JS', orderIndex: 1 },
              { label: 'They only work on mobile devices', value: 'mobile', orderIndex: 2 },
              { label: 'They disable caching automatically', value: 'caching', orderIndex: 3 },
            ],
          },
          {
            title: 'Which PostgreSQL index type is most suitable for equality and range queries?',
            type: 'MULTIPLE_CHOICE',
            isRequired: true,
            orderIndex: 1,
            quizPoints: 10,
            quizAnswer: { correctValue: 'B-tree' },
            quizExplanation: 'B-tree is the default and standard index type in PostgreSQL for equality and range comparisons.',
            options: [
              { label: 'Hash index', value: 'Hash', orderIndex: 0 },
              { label: 'B-tree', value: 'B-tree', orderIndex: 1 },
              { label: 'BRIN index', value: 'BRIN', orderIndex: 2 },
              { label: 'GIN index', value: 'GIN', orderIndex: 3 },
            ],
          },
          {
            title: 'Which HTTP headers prevent Clickjacking attacks?',
            type: 'CHECKBOXES',
            isRequired: true,
            orderIndex: 2,
            quizPoints: 15,
            quizAnswer: { correctValues: ['Content-Security-Policy (frame-ancestors)', 'X-Frame-Options'] },
            quizExplanation: 'Both X-Frame-Options and CSP frame-ancestors restrict framing in iframes.',
            options: [
              { label: 'Content-Security-Policy (frame-ancestors)', value: 'Content-Security-Policy (frame-ancestors)', orderIndex: 0 },
              { label: 'X-Frame-Options', value: 'X-Frame-Options', orderIndex: 1 },
              { label: 'Access-Control-Allow-Origin', value: 'cors', orderIndex: 2 },
              { label: 'Strict-Transport-Security', value: 'hsts', orderIndex: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'course-evaluation',
    title: 'End of Semester Course Evaluation',
    description: 'Your feedback directly helps instructors refine curricula and teaching effectiveness.',
    category: 'Education',
    theme: {
      primaryColor: '#4f46e5', // Indigo
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Course Feedback',
        description: 'Rate curriculum, materials, and lectures.',
        orderIndex: 0,
        questions: [
          {
            title: 'Course Title',
            type: 'SHORT_ANSWER',
            isRequired: true,
            orderIndex: 0,
          },
          {
            title: 'The course materials were clear and well-structured',
            type: 'LINEAR_SCALE',
            isRequired: true,
            orderIndex: 1,
            config: { scaleMin: 1, scaleMax: 5, scaleMinLabel: 'Strongly Disagree', scaleMaxLabel: 'Strongly Agree' },
          },
          {
            title: 'Instructor responsiveness to questions',
            type: 'RATING',
            isRequired: true,
            orderIndex: 2,
            config: { ratingMax: 5, ratingIcon: 'STAR' },
          },
          {
            title: 'What was the most valuable topic covered?',
            type: 'PARAGRAPH',
            isRequired: false,
            orderIndex: 3,
          },
        ],
      },
    ],
  },
  {
    id: 'product-feedback',
    title: 'Product Feature & Usability Feedback',
    description: 'Help us prioritize the upcoming roadmap with your user insights.',
    category: 'Product',
    theme: {
      primaryColor: '#0d9488', // Teal
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Feature Feedback',
        description: 'Tell us how you use our application.',
        orderIndex: 0,
        questions: [
          {
            title: 'How often do you use the application?',
            type: 'MULTIPLE_CHOICE',
            isRequired: true,
            orderIndex: 0,
            options: [
              { label: 'Daily', value: 'daily', orderIndex: 0 },
              { label: 'Weekly', value: 'weekly', orderIndex: 1 },
              { label: 'Monthly', value: 'monthly', orderIndex: 2 },
              { label: 'Rarely', value: 'rarely', orderIndex: 3 },
            ],
          },
          {
            title: 'Which upcoming feature would benefit you most?',
            type: 'DROPDOWN',
            isRequired: true,
            orderIndex: 1,
            options: [
              { label: 'Mobile Offline Mode', value: 'offline', orderIndex: 0 },
              { label: 'Advanced Realtime Collaboration', value: 'collab', orderIndex: 1 },
              { label: 'Automated Webhooks & Integrations', value: 'webhooks', orderIndex: 2 },
              { label: 'AI Form Generation', value: 'ai', orderIndex: 3 },
            ],
          },
          {
            title: 'Any additional ideas or suggestions?',
            type: 'PARAGRAPH',
            isRequired: false,
            orderIndex: 2,
          },
        ],
      },
    ],
  },
  {
    id: 'appointment-request',
    title: 'Consultation & Appointment Request',
    description: 'Book a discovery session with one of our specialized consultants.',
    category: 'Services',
    theme: {
      primaryColor: '#475569', // Slate
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-xl',
    },
    sections: [
      {
        title: 'Booking Details',
        description: 'Provide preferred dates and consultation goals.',
        orderIndex: 0,
        questions: [
          {
            title: 'Your Name',
            type: 'SHORT_ANSWER',
            isRequired: true,
            orderIndex: 0,
          },
          {
            title: 'Preferred Date',
            type: 'DATE',
            isRequired: true,
            orderIndex: 1,
          },
          {
            title: 'Preferred Time Window',
            type: 'TIME',
            isRequired: true,
            orderIndex: 2,
          },
          {
            title: 'Consultation Topic',
            type: 'MULTIPLE_CHOICE',
            isRequired: true,
            orderIndex: 3,
            options: [
              { label: 'Architecture & System Design', value: 'arch', orderIndex: 0 },
              { label: 'Security & Penetration Audit', value: 'sec', orderIndex: 1 },
              { label: 'Cloud Migration & Cost Optimization', value: 'cloud', orderIndex: 2 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'party-rsvp',
    title: 'Team Celebration & RSVP',
    description: 'Celebrate our team milestones with good food, drinks, and games.',
    category: 'Events',
    theme: {
      primaryColor: '#db2777', // Pink
      backgroundColor: '#004B6E',
      cardColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'rounded-3xl',
    },
    sections: [
      {
        title: 'Attendance Details',
        description: 'Let us know if you can make it!',
        orderIndex: 0,
        questions: [
          {
            title: 'Can you attend?',
            type: 'MULTIPLE_CHOICE',
            isRequired: true,
            orderIndex: 0,
            options: [
              { label: 'Yes, I will be there!', value: 'yes', orderIndex: 0 },
              { label: 'Sorry, I cannot make it', value: 'no', orderIndex: 1 },
            ],
          },
          {
            title: 'Will you be bringing a plus one?',
            type: 'MULTIPLE_CHOICE',
            isRequired: true,
            orderIndex: 1,
            options: [
              { label: 'No, just me', value: '0', orderIndex: 0 },
              { label: 'Yes, 1 guest', value: '1', orderIndex: 1 },
              { label: 'Yes, 2+ guests', value: '2', orderIndex: 2 },
            ],
          },
          {
            title: 'Song or game suggestions',
            type: 'PARAGRAPH',
            isRequired: false,
            orderIndex: 2,
          },
        ],
      },
    ],
  },
];
