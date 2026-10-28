// Generates postman/hospital-booking.postman_collection.json (Postman v2.1 format).
// Kept as code so the test scripts stay readable; import the generated JSON into Postman or run it with newman.
import { writeFileSync } from 'node:fs';

const json = (obj) => JSON.stringify(obj, null, 2);
const lines = (fn) => fn.toString().split('\n').slice(1, -1).map((l) => l.replace(/^ {4}/, ''));

const request = (name, method, path, { body, formdata, test, prerequest } = {}) => {
  const item = {
    name,
    request: {
      method,
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: { raw: `{{baseUrl}}${path}`, host: ['{{baseUrl}}'], path: path.replace(/^\//, '').split('/') },
    },
    event: [],
  };
  if (body) item.request.body = { mode: 'raw', raw: json(body), options: { raw: { language: 'json' } } };
  if (formdata) item.request.body = { mode: 'formdata', formdata };
  if (prerequest) item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(prerequest) } });
  if (test) item.event.push({ listen: 'test', script: { type: 'text/javascript', exec: lines(test) } });
  return item;
};

const startBooking = (name, processId, keyVar, variables) =>
  request(name, 'POST', '/v2/process-instances', {
    body: { processDefinitionId: processId, variables },
    test: `
    pm.test('instance created', () => pm.response.to.have.status(200));
    pm.collectionVariables.set('${keyVar}', pm.response.json().processInstanceKey);
    console.log('${keyVar} =', pm.response.json().processInstanceKey);
    `,
  });

const wait = (ms) => `
    setTimeout(() => {}, ${ms});
    `;

const collection = {
  info: {
    name: 'Exercise 8 – Hospital appointment booking (Camunda 8)',
    description:
      'Deploys send-notification, slot_decision, hospital-booking and hospital-booking-propagate-all to a local Camunda 8.10 orchestration cluster, runs the three required test cases plus the propagation comparison, and verifies the results through the v2 REST API.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:8088' },
    { key: 'telegramMockUrl', value: 'http://localhost:8090' },
  ],
  item: [
    {
      name: '0 Setup',
      item: [
        request('Cluster topology', 'GET', '/v2/topology', {
          test: function () {
            pm.test('broker healthy', () => {
              pm.response.to.have.status(200);
              pm.expect(pm.response.json().brokers[0].partitions[0].health).to.eql('healthy');
            });
          },
        }),
        request('Deploy BPMN + DMN', 'POST', '/v2/deployments', {
          formdata: [
            { key: 'resources', type: 'file', src: 'bpmn/send-notification.bpmn' },
            { key: 'resources', type: 'file', src: 'dmn/slot_decision.dmn' },
            { key: 'resources', type: 'file', src: 'bpmn/hospital-booking.bpmn' },
            { key: 'resources', type: 'file', src: 'bpmn/hospital-booking-propagate-all.bpmn' },
          ],
          test: function () {
            pm.test('deployed 3 processes and 1 decision', () => {
              pm.response.to.have.status(200);
              const d = pm.response.json().deployments;
              const ids = d.map((x) => (x.processDefinition || x.decisionDefinition || {}).processDefinitionId || (x.decisionDefinition || {}).decisionDefinitionId).filter(Boolean);
              pm.expect(ids).to.include.members(['send-notification', 'slot_decision', 'hospital-booking', 'hospital-booking-propagate-all']);
            });
          },
        }),
      ],
    },
    {
      name: '1 Case – Cardiology bookedCount 3 (booking succeeds)',
      item: [
        startBooking('Start booking P-1001', 'hospital-booking', 'case1Key', {
          patientId: 'P-1001', patientName: 'Asha Verma', department: 'Cardiology', preferredSlot: '2026-11-03 10:30', bookedCount: 3, appointmentWaitTime: 'PT20S',
        }),
      ],
    },
    {
      name: '2 Case – Cardiology bookedCount 12 (slot full)',
      item: [
        startBooking('Start booking P-1002', 'hospital-booking', 'case2Key', {
          patientId: 'P-1002', patientName: 'Rahul Mehta', department: 'Cardiology', preferredSlot: '2026-11-03 11:00', bookedCount: 12,
        }),
      ],
    },
    {
      name: '3 Case – booking then cancellation',
      item: [
        startBooking('Start booking P-1003', 'hospital-booking', 'case3Key', {
          patientId: 'P-1003', patientName: 'Neha Kapoor', department: 'Cardiology', preferredSlot: '2026-11-04 09:00', bookedCount: 5, appointmentWaitTime: 'PT1H',
        }),
        request('Booking is waiting for the appointment', 'POST', '/v2/element-instances/search', {
          prerequest: wait(8000),
          body: { filter: { processInstanceKey: '{{case3Key}}', elementId: 'Timer_WaitForAppointment', state: 'ACTIVE' } },
          test: function () {
            pm.test('slot booked, confirmation sent, timer active', () => {
              pm.response.to.have.status(200);
              pm.expect(pm.response.json().items.length).to.eql(1);
            });
          },
        }),
        request('Patient sends cancellation (message)', 'POST', '/v2/messages/correlation', {
          body: { name: 'booking-cancellation', correlationKey: 'P-1003', variables: { cancellationReason: 'Patient is travelling that week' } },
          test: function () {
            pm.test('correlated to the case 3 instance', () => {
              pm.response.to.have.status(200);
              pm.expect(String(pm.response.json().processInstanceKey)).to.eql(pm.collectionVariables.get('case3Key'));
            });
          },
        }),
      ],
    },
    {
      name: '4 Propagation comparison',
      item: [
        startBooking('Start booking P-1004 (propagate ALL variables)', 'hospital-booking-propagate-all', 'propAllKey', {
          patientId: 'P-1004', patientName: 'Vikram Singh', department: 'Neurology', preferredSlot: '2026-11-05 14:00', bookedCount: 2, appointmentWaitTime: 'PT20S',
        }),
      ],
    },
    {
      name: '5 Verify results',
      item: [
        request('Case 1 parent completed via booking path', 'POST', '/v2/variables/search', {
          prerequest: wait(30000),
          body: { filter: { processInstanceKey: '{{case1Key}}', scopeKey: '{{case1Key}}' }, page: { limit: 100 } },
          test: function () {
            const v = Object.fromEntries(pm.response.json().items.map((i) => [i.name, JSON.parse(i.value)]));
            pm.test('slotStatus AVAILABLE, BOOKED, confirmation SENT', () => {
              pm.expect(v.slotStatus).to.eql('AVAILABLE');
              pm.expect(v.bookingStatus).to.eql('BOOKED');
              pm.expect(v.bookingRef).to.eql('APT-CARD-P-1001');
              pm.expect(v.bookedCount).to.eql(4);
              pm.expect(v.confirmationStatus).to.eql('SENT');
            });
            pm.test('child-only variables did not leak into the parent', () => {
              pm.expect(v).to.not.have.property('recipientId');
              pm.expect(v).to.not.have.property('messageText');
            });
          },
        }),
        request('Case 1 parent state', 'GET', '/v2/process-instances/{{case1Key}}', {
          test: function () {
            pm.test('COMPLETED', () => pm.expect(pm.response.json().state).to.eql('COMPLETED'));
          },
        }),
        request('Case 1 child instance (called by Send confirmation)', 'POST', '/v2/process-instances/search', {
          body: { filter: { parentProcessInstanceKey: '{{case1Key}}' } },
          test: function () {
            const items = pm.response.json().items;
            pm.test('one completed send-notification child', () => {
              pm.expect(items.length).to.eql(1);
              pm.expect(items[0].processDefinitionId).to.eql('send-notification');
              pm.expect(items[0].state).to.eql('COMPLETED');
            });
            pm.collectionVariables.set('case1ChildKey', items[0].processInstanceKey);
          },
        }),
        request('Case 1 child variables (propagation OFF)', 'POST', '/v2/variables/search', {
          body: { filter: { processInstanceKey: '{{case1ChildKey}}', scopeKey: '{{case1ChildKey}}' }, page: { limit: 100 } },
          test: function () {
            const names = pm.response.json().items.map((i) => i.name).sort();
            console.log('child variables (propagation OFF):', names.join(', '));
            pm.test('child only sees recipientId + messageText (plus its own result)', () => {
              pm.expect(names).to.eql(['messageText', 'notificationStatus', 'recipientId', 'telegramMessageId']);
            });
          },
        }),
        request('Case 2 parent took the FULL path', 'POST', '/v2/variables/search', {
          body: { filter: { processInstanceKey: '{{case2Key}}', scopeKey: '{{case2Key}}' }, page: { limit: 100 } },
          test: function () {
            const v = Object.fromEntries(pm.response.json().items.map((i) => [i.name, JSON.parse(i.value)]));
            pm.test('slotStatus FULL, slot-full notice SENT, nothing booked', () => {
              pm.expect(v.slotStatus).to.eql('FULL');
              pm.expect(v.slotFullNoticeStatus).to.eql('SENT');
              pm.expect(v).to.not.have.property('bookingRef');
            });
          },
        }),
        request('Case 2 FULL end event reached', 'POST', '/v2/element-instances/search', {
          body: { filter: { processInstanceKey: '{{case2Key}}', elementId: 'EndEvent_BookingRejected' } },
          test: function () {
            pm.test('Booking rejected (slot full) completed', () => pm.expect(pm.response.json().items.length).to.eql(1));
          },
        }),
        request('Case 3 cancellation path', 'POST', '/v2/variables/search', {
          body: { filter: { processInstanceKey: '{{case3Key}}', scopeKey: '{{case3Key}}' }, page: { limit: 100 } },
          test: function () {
            const v = Object.fromEntries(pm.response.json().items.map((i) => [i.name, JSON.parse(i.value)]));
            pm.test('slot released, cancellation notice SENT', () => {
              pm.expect(v.bookingStatus).to.eql('CANCELLED');
              pm.expect(v.slotReleased).to.eql(true);
              pm.expect(v.bookedCount).to.eql(5);
              pm.expect(v.confirmationStatus).to.eql('SENT');
              pm.expect(v.cancellationNoticeStatus).to.eql('SENT');
            });
          },
        }),
        request('Case 3 has two children (confirmation + cancellation)', 'POST', '/v2/process-instances/search', {
          body: { filter: { parentProcessInstanceKey: '{{case3Key}}' } },
          test: function () {
            pm.test('2 send-notification children', () => pm.expect(pm.response.json().items.length).to.eql(2));
          },
        }),
        request('Case 3 timer was interrupted', 'POST', '/v2/element-instances/search', {
          body: { filter: { processInstanceKey: '{{case3Key}}', elementId: 'Timer_WaitForAppointment' } },
          test: function () {
            pm.test('timer TERMINATED by interrupting event subprocess', () => pm.expect(pm.response.json().items[0].state).to.eql('TERMINATED'));
          },
        }),
        request('Propagate-all child instance', 'POST', '/v2/process-instances/search', {
          body: { filter: { parentProcessInstanceKey: '{{propAllKey}}' } },
          test: function () {
            pm.collectionVariables.set('propAllChildKey', pm.response.json().items[0].processInstanceKey);
          },
        }),
        request('Propagate-all child variables (propagation ON)', 'POST', '/v2/variables/search', {
          body: { filter: { processInstanceKey: '{{propAllChildKey}}', scopeKey: '{{propAllChildKey}}' }, page: { limit: 100 } },
          test: function () {
            const names = pm.response.json().items.map((i) => i.name).sort();
            console.log('child variables (propagation ON):', names.join(', '));
            pm.test('child received every parent variable', () => {
              pm.expect(names).to.include.members(['patientName', 'department', 'bookedCount', 'slotStatus', 'bookingRef', 'recipientId', 'messageText']);
            });
          },
        }),
        request('Propagate-all parent got child variables back', 'POST', '/v2/variables/search', {
          body: { filter: { processInstanceKey: '{{propAllKey}}', scopeKey: '{{propAllKey}}' }, page: { limit: 100 } },
          test: function () {
            const names = pm.response.json().items.map((i) => i.name);
            pm.test('child result variables were copied back into the parent', () => {
              pm.expect(names).to.include.members(['notificationStatus', 'telegramMessageId']);
              pm.expect(names).to.not.include('confirmationStatus');
            });
          },
        }),
        request('Telegram inbox received every notification', 'GET', '/messages', {
          test: function () {
            const msgs = pm.response.json();
            pm.test('confirmation, slot-full, confirmation + cancellation, propagate-all confirmation', () => {
              const byChat = (id) => msgs.filter((m) => m.chat_id === id).map((m) => m.text);
              pm.expect(byChat('P-1001')[0]).to.include('is confirmed');
              pm.expect(byChat('P-1002')[0]).to.include('is full');
              pm.expect(byChat('P-1003').length).to.eql(2);
              pm.expect(byChat('P-1003')[1]).to.include('has been cancelled');
              pm.expect(byChat('P-1004')[0]).to.include('is confirmed');
            });
          },
        }),
      ],
    },
  ],
};

// The inbox request targets the Telegram mock, not Camunda
const inbox = collection.item[5].item.at(-1).request.url;
inbox.raw = '{{telegramMockUrl}}/messages';
inbox.host = ['{{telegramMockUrl}}'];

writeFileSync(new URL('../postman/hospital-booking.postman_collection.json', import.meta.url), json(collection) + '\n');
console.log('wrote postman/hospital-booking.postman_collection.json');
