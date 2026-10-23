export const BRAND_NAME = 'Applotie Travels';

export const BUS_TYPES = [
  'AC Seater',
  'Non-AC Seater',
  'AC Semi-Sleeper',
  'Non-AC Semi-Sleeper',
  'Volvo Multi-Axle AC',
  'Mini Bus',
  'Tempo Traveller',
];

export const BUS_STATUSES = ['Active', 'Under Maintenance', 'Inactive'];

export const TRIP_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];

// Daily and Weekly trips are repeating trips (schedules): Daily runs every day
// from its start date, Weekly on chosen days of the week. Custom adds one
// ordinary trip for each chosen date.
export const TRIP_FREQUENCIES = [
  { value: 'Daily', label: 'Daily' },
  { value: 'Weekly', label: 'Days of week' },
  { value: 'Custom', label: 'Specific dates' },
];
// Monday first; `value` is the Date#getDay number (0 = Sunday).
export const WEEKDAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 0, short: 'Sun', label: 'Sunday' },
];
export const MAX_TRIP_DATES = 60;
export const SCHEDULE_STATUSES = ['Active', 'Paused'];

export const BOOKING_STATUSES = ['Confirmed', 'Cancelled'];
export const PAYMENT_STATUSES = ['Unpaid', 'Paid'];
export const EXPENSE_PAYMENT_STATUSES = ['Paid', 'Pending'];

export const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Card', 'Other'];

export const EXPENSE_GROUPS = {
  salary: 'Salaries',
  fuel: 'Fuel',
  maintenance: 'Maintenance & repairs',
  documents: 'Insurance & documents',
  other: 'Other operating costs',
};

export const EXPENSE_CATEGORIES = [
  { value: 'driver_salary', label: 'Driver salary', group: 'salary', staffRole: 'Driver' },
  { value: 'conductor_salary', label: 'Conductor/helper salary', group: 'salary', staffRole: 'Conductor/Helper' },
  { value: 'staff_salary', label: 'Other staff salary', group: 'salary', staffRole: 'Other staff' },
  { value: 'fuel', label: 'Fuel / diesel', group: 'fuel' },
  { value: 'routine_servicing', label: 'Routine servicing', group: 'maintenance' },
  { value: 'repairs_maintenance', label: 'Repairs & maintenance', group: 'maintenance' },
  { value: 'spare_parts', label: 'Spare parts', group: 'maintenance' },
  { value: 'insurance', label: 'Insurance', group: 'documents' },
  { value: 'road_tax_permits', label: 'Road tax & permits', group: 'documents' },
  { value: 'fitness_pollution', label: 'Fitness & pollution certification', group: 'documents' },
  { value: 'toll', label: 'Toll charges', group: 'other' },
  { value: 'parking', label: 'Parking charges', group: 'other' },
  { value: 'cleaning', label: 'Cleaning', group: 'other' },
  { value: 'miscellaneous', label: 'Miscellaneous', group: 'other' },
];

export const SALARY_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c.group === 'salary').map((c) => c.value);
export const MAINTENANCE_EXPENSE_CATEGORIES = ['routine_servicing', 'repairs_maintenance', 'spare_parts'];

export function categoryMeta(value) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value) || null;
}

export function categoryLabel(value) {
  return categoryMeta(value)?.label || 'Unknown category';
}

export const SERVICE_TYPES = [
  { value: 'Routine service', category: 'routine_servicing' },
  { value: 'Oil change', category: 'routine_servicing' },
  { value: 'Inspection', category: 'routine_servicing' },
  { value: 'Repair', category: 'repairs_maintenance' },
  { value: 'Brake service', category: 'repairs_maintenance' },
  { value: 'Engine work', category: 'repairs_maintenance' },
  { value: 'Electrical', category: 'repairs_maintenance' },
  { value: 'Body work', category: 'repairs_maintenance' },
  { value: 'Tyre replacement', category: 'spare_parts' },
  { value: 'Parts replacement', category: 'spare_parts' },
  { value: 'Other', category: 'repairs_maintenance' },
];

export const DOCUMENT_FIELDS = [
  { key: 'insuranceExpiry', label: 'Insurance' },
  { key: 'fitnessExpiry', label: 'Fitness certificate' },
  { key: 'permitExpiry', label: 'Permit' },
  { key: 'pollutionExpiry', label: 'Pollution (PUC) certificate' },
];

export const LAYOUT_PRESETS = [
  { value: '2+1', left: 2, right: 1 },
  { value: '2+2', left: 2, right: 2 },
  { value: '1+1', left: 1, right: 1 },
  { value: '3+2', left: 3, right: 2 },
];

export const MAX_CAPACITY = 80;
export const MAX_SEATS_PER_BOOKING = 6;
export const HOLD_DURATION_MS = 5 * 60 * 1000;

export const DOC_WARNING_DAYS = 30;
export const SERVICE_WARNING_DAYS = 14;
export const SERVICE_KM_WARNING = 1000;

export const REVENUE_BASES = {
  confirmed: {
    label: 'Confirmed-booking basis',
    short: 'Confirmed bookings',
    description: 'Revenue counts every confirmed (non-cancelled) booking on non-cancelled trips in the period, whether or not the trip has run yet.',
  },
  completed: {
    label: 'Completed-trip basis',
    short: 'Completed trips',
    description: 'Revenue counts only confirmed bookings on trips the operator has marked Completed.',
  },
};
