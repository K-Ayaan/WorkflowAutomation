#!/bin/sh
# Derives bpmn/hospital-booking-propagate-all.bpmn from bpmn/hospital-booking.bpmn for the propagation comparison:
# same model, but every call activity propagates ALL parent variables in and ALL child variables back
# (output mappings removed, because Zeebe ignores propagateAllChildVariables when output mappings exist).
cd "$(dirname "$0")/.." || exit 1
sed -e 's/bpmn:process id="hospital-booking" name="Hospital Appointment Booking"/bpmn:process id="hospital-booking-propagate-all" name="Hospital Appointment Booking (propagate all variables)"/' \
    -e 's/bpmnElement="hospital-booking"/bpmnElement="hospital-booking-propagate-all"/' \
    -e 's/Definitions_HospitalBooking"/Definitions_HospitalBookingPropagateAll"/' \
    -e 's/propagateAllChildVariables="false" propagateAllParentVariables="false"/propagateAllChildVariables="true" propagateAllParentVariables="true"/' \
    -e '/<zeebe:output source="=notificationStatus"/d' \
    -e 's/Call activities use explicit input\/output mappings only (propagation of all variables switched off)/Comparison variant: call activities propagate ALL parent variables to the child and ALL child variables back (no output mappings)/' \
    bpmn/hospital-booking.bpmn > bpmn/hospital-booking-propagate-all.bpmn
