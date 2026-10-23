# Hostel Out-Pass Workflow (Camunda 8 SaaS + Spring Boot)

Process ID `hostel-outpass`, Form ID `warden-approval-form`. Files: `src/main/resources/bpmn/hostel-outpass.bpmn`, `warden-approval.form`.

## Run
1. Create a cluster (8.8) and an API client with the Zeebe / Orchestration Cluster scope in console.camunda.io.
2. Put the four values in `src/main/resources/application.yaml`, or set `CAMUNDA_CLIENT_ID`, `CAMUNDA_CLIENT_SECRET`, `CAMUNDA_CLUSTER_ID`, `CAMUNDA_CLUSTER_REGION`.
3. `mvn spring-boot:run` (JDK 17+). The app deploys the BPMN and form on start-up.

## Test cases (use future dates)
```
# 1. Day out (0 nights) -> auto-approved, passStatus ISSUED
curl -X POST http://localhost:8080/outpass -H "Content-Type: application/json" -d '{"studentName":"Priya","regNo":"RA2311003010001","hostelBlock":"A","outDate":"2026-11-10","returnDate":"2026-11-10","parentPhone":"9876543210","purpose":"Shopping"}'

# 2. Two nights -> waits in Tasklist for the Warden; tick Approve, add a remark, Complete -> ISSUED
curl -X POST http://localhost:8080/outpass -H "Content-Type: application/json" -d '{"studentName":"Arun","regNo":"RA2311003010002","hostelBlock":"B","outDate":"2026-11-10","returnDate":"2026-11-12","parentPhone":"9876543211","purpose":"Family function"}'

# 3. Return before out -> invalid, REJECTED, no warden involved
curl -X POST http://localhost:8080/outpass -H "Content-Type: application/json" -d '{"studentName":"Meena","regNo":"RA2311003010003","hostelBlock":"C","outDate":"2026-11-12","returnDate":"2026-11-10","parentPhone":"9876543212","purpose":"Test"}'
```
A warden who leaves the Tasklist form unticked (or the escalated Chief Warden declining) gives `REJECTED`.

## Gateway conditions
`=valid and nights = 0` (auto-approve), `=valid and nights >= 1` (Warden approval), `=not(valid)` (reject).

## Bonus: escalation
A 24-hour (`PT24H`) interrupting timer boundary event on *Warden approval* cancels that task and creates *Chief Warden approval*, which uses the same form. To demo it quickly, temporarily change the duration to `PT1M`.

## Variable note
| Worker / task | Reads | Writes |
|---|---|---|
| `check-outpass` (Check request) | `regNo`, `outDate`, `returnDate` | `nights`, `valid`, `approved` (true only for a valid day out) |
| Warden / Chief Warden form | shows `studentName`, `regNo`, `hostelBlock`, `outDate`, `returnDate`, `nights`, `purpose`, `parentPhone` | `approved` (checkbox), `wardenRemarks` |
| `issue-outpass` (Issue out-pass) | `regNo`, `outDate`, `studentName`, `parentPhone`, `approved`, `wardenRemarks` | `passStatus` (`ISSUED` / `REJECTED`), `passNumber` = `OP-<regNo>-<outDate>` (approved only) |

`check-outpass` sets `approved` so the same variable feeds `issue-outpass` on every path: it stays as set for day-out and invalid requests, and the form overwrites it for requests that go to the Warden. `wardenRemarks` is absent on auto-approved and rejected paths, so it logs as `null`.
