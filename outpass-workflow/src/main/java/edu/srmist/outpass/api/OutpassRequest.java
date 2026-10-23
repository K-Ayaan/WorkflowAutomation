package edu.srmist.outpass.api;

/** JSON body of POST /outpass; every field becomes a process variable. */
public record OutpassRequest(
        String studentName,
        String regNo,
        String hostelBlock,
        String outDate,
        String returnDate,
        String parentPhone,
        String purpose) {
}
