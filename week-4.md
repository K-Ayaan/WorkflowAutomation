# FORM CODE-leave-request.form
{
  "id": "leave-request-form",
  "type": "default",
  "components": [
    {
      "label": "Student Name",
      "type": "textfield",
      "key": "studentName",
      "validate": {
        "required": true
      }
    },
    {
      "label": "Leave Date",
      "type": "datetime",
      "key": "leaveDate",
      "dateOnly": true,
      "validate": {
        "required": true
      }
    },
    {
      "label": "Reason for Leave",
      "type": "textarea",
      "key": "reason",
      "validate": {
        "required": true
      }
    }
  ],
  "executionPlatform": "Camunda Cloud",
  "executionPlatformVersion": "8.7.0",
  "exporter": {
    "name": "Camunda Modeler",
    "version": "5.0.0"
  }
}


# AND THE 

# EXPECTED OUTPUT:
{
  "studentName": "Rahul Sharma",
  "leaveDate": "2026-10-25",
  "reason": "Medical appointment"
}
