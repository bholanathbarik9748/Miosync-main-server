export const mapExcelRow = (row: any, eventId: string) => {
  // Helper function to convert Excel serial date to JavaScript Date
  const excelDateToJSDate = (excelDate: number): Date => {
    const excelEpoch = new Date(1900, 0, 1);
    const jsDate = new Date(
      excelEpoch.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000,
    );
    return jsDate;
  };

  // Helper function to parse date string in DD-MM-YYYY format
  const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    try {
      // Handle DD-MM-YYYY format
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-based
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
      // For ISO strings and other formats, use native Date parsing
      return new Date(dateStr);
    } catch {
      return null;
    }
  };

  // Helper function to safely get value from row
  const getValue = (key1: string, key2: string): any => {
    return row[key1] ?? row[key2] ?? null;
  };

  // Helper function to safely convert to string
  const toString = (value: any): string | null => {
    return value ? String(value) : null;
  };

  // Helper function to handle date values
  const parseDate = (key1: string, key2: string): Date | null => {
    const dateValue = getValue(key1, key2);
    if (!dateValue) return null;

    // If it's already a Date object, return it
    if (dateValue instanceof Date) {
      return dateValue;
    }

    // If it's a number (Excel serial date), convert it
    if (typeof dateValue === 'number') {
      return excelDateToJSDate(dateValue);
    }

    // If it's a string, try to parse it
    if (typeof dateValue === 'string') {
      return parseDateString(dateValue);
    }

    return null;
  };

  // Helper function to handle yes/no values
  const parseYesNo = (key1: string, key2: string): Date | null => {
    const value = getValue(key1, key2);
    return typeof value === 'string' && value.toLowerCase() === 'yes'
      ? new Date()
      : null;
  };

  return {
    eventId,
    name: getValue('Name', '__EMPTY_1'),
    category: getValue('Category', '__EMPTY_2'),
    phoneNumber: toString(getValue('Mobile No.', '__EMPTY_3')),
    city: getValue('City', '__EMPTY_4'),
    dateOfArrival: parseDate('Date Of Arrival', '__EMPTY_5'),
    modeOfArrival: getValue('Mode of Arrival', '__EMPTY_6'),
    trainFlightNumber: toString(getValue('Train/Flight Number', '__EMPTY_7')),
    time: getValue('Time', '__EMPTY_8'),
    hotelName: getValue('Hotel Name', '__EMPTY_9'),
    roomType: toString(getValue('Room Type', '__EMPTY_10')),
    checkIn: parseYesNo('Check-in', '__EMPTY_11'),
    checkOut: parseYesNo('Check-out', '__EMPTY_12'),
    departureDetails: getValue('Departure Details', '__EMPTY_13'),
    departureTime: getValue('Departure Time', '__EMPTY_14'),
    attending: getValue('Attending', '__EMPTY_15'),
    remarks: getValue('Remarks', '__EMPTY_16'),
    remarksRound2: getValue('Remarks (round 2)', '__EMPTY_17'),
  };
};
