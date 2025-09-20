export const mapExcelRow = (row: any, eventId: string) => {
  return {
    eventId,
    name: row['Name'] ?? null,
    category: row['Category'] ?? null,
    phoneNumber: row['Mobile No.'] ? String(row['Mobile No.']) : null,
    city: row['City'] ?? null,
    dateOfArrival: row['Date Of Arrival']
      ? new Date(row['Date Of Arrival'])
      : null, // assuming the date is already a string like '02-02-2022'
    modeOfArrival: row['Mode of Arrival'] ?? null,
    trainFlightNumber: row['Train/Flight Number']
      ? String(row['Train/Flight Number'])
      : null,
    time: row['Time'] ?? null,
    hotelName: row['Hotel Name'] ?? null,
    roomType: row['Room Type'] ? String(row['Room Type']) : null,
    checkIn:
      typeof row['Check-in'] === 'string' &&
      row['Check-in'].toLowerCase() === 'yes'
        ? new Date()
        : null,
    checkOut:
      typeof row['Check-out'] === 'string' &&
      row['Check-out'].toLowerCase() === 'yes'
        ? new Date()
        : null,
    departureDetails: row['Departure Details'] ?? null,
    departureTime: row['Departure Time'] ?? null,
    attending: row['Attending'] ?? null,
    remarks: row['Remarks'] ?? null,
    remarksRound2: row['Remarks (round 2)'] ?? null,
  };
};
