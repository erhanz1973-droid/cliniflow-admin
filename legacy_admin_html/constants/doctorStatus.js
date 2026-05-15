// Doctor Status Constants
export const DOCTOR_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED", 
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
};

// Status display mappings
export const DOCTOR_STATUS_TEXT = {
  [DOCTOR_STATUS.PENDING]: "Beklemede",
  [DOCTOR_STATUS.APPROVED]: "Onaylı",
  [DOCTOR_STATUS.REJECTED]: "Reddedildi",
  [DOCTOR_STATUS.SUSPENDED]: "Askıya Alındı",
};

// Status color classes
export const DOCTOR_STATUS_CLASS = {
  [DOCTOR_STATUS.PENDING]: "pending",
  [DOCTOR_STATUS.APPROVED]: "approved", 
  [DOCTOR_STATUS.REJECTED]: "rejected",
  [DOCTOR_STATUS.SUSPENDED]: "suspended",
};
