export const stableId = (family, number) => `${family}0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const firms = [
  {id:'10000000-0000-4000-8000-000000000001',name:'Northline Legal'},
  {id:'10000000-0000-4000-8000-000000000002',name:'Harbour Law'},
  {id:'10000000-0000-4000-8000-000000000003',name:'Cedar Legal'},
  {id:'10000000-0000-4000-8000-000000000004',name:'Pacific Counsel'},
  {id:'10000000-0000-4000-8000-000000000005',name:'Prairie Legal'},
  {id:'10000000-0000-4000-8000-000000000006',name:'Laurent Legal'},
];
export const staff = [
  {id:stableId(2,10),name:'Renee Walker',email:'renee@example.com',role:'attorney',firm:2},
  {id:stableId(2,11),name:'Daniel Park',email:'daniel@example.com',role:'attorney',firm:3},
  {id:stableId(2,12),name:'Amara Okafor',email:'amara@example.com',role:'attorney',firm:4},
  {id:stableId(2,13),name:'Luc Moreau',email:'luc@example.com',role:'attorney',firm:5},
  {id:stableId(2,14),name:'Elena Brooks',email:'elena@example.com',role:'paralegal',firm:2},
];
export const firmActors = ['20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000005',...staff.slice(0,4).map(person=>person.id)];
export const adminId='20000000-0000-4000-8000-000000000006';
// Each person has one matter. Maya and Jordan keep their existing starting records.
const entries = [
 ['Nora Davis','Unpaid commission','Employment','Ontario',0,'My employer withheld the final quarter of commission after I left. I have the commission plan and the statements showing completed sales.'],
 ['Hannah Kim','Heating repairs','Housing','Ontario',1,'The heating in my apartment has failed repeatedly. I reported it three times and have paid for temporary heaters while waiting for repairs.'],
 ['Olivia Tremblay','Deposit not returned','Housing','Quebec',5,'My landlord has kept the payment I made when I signed the lease. I moved out after giving notice and want help recovering the outstanding amount.'],
 ['Omar Hassan','Cycling collision','Personal injury','British Columbia',3,'A driver struck my bicycle at an intersection. I have a police incident number, medical expenses, and correspondence from the insurer.'],
 ['Ethan Nguyen','Unpaid design invoice','Contract dispute','British Columbia',3,'A client has not paid the final invoice for a completed website. The signed agreement and approval emails show the work they accepted.'],
 ['Evelyn Scott','Dismissal notice','Employment','Alberta',4,'I was dismissed after five years at the company. I want someone to review the notice and release before I respond.'],
 ['Felix Roy','Renovation agreement','Contract dispute','Quebec',5,'The contractor stopped work before completing the kitchen renovation. I have paid the agreed deposits and kept records of the unfinished items.'],
 ['Chloe Anderson','Water damage in rental','Housing','British Columbia',2,'A leak damaged my belongings and part of the bedroom ceiling. I have repair requests, photographs, and receipts for the items I replaced.'],
 ['Lucas Morgan','Overtime pay','Employment','British Columbia',2,'My pay records do not include overtime from the last six weeks. I kept my schedules and a record of the additional hours.'],
 ['Isabella Rossi','Injury in a shop','Personal injury','Ontario',1,'I fell on a wet floor in a shop and injured my wrist. I reported the incident and have treatment records and receipts.'],
 ['Noah Williams','Employment agreement','Employment','Ontario',0,'I received a new employment agreement with changes to compensation and termination terms. I would like a review before signing it.'],
 ['Amelia Brown','Software delivery dispute','Contract dispute','Ontario',0,'A software supplier missed the agreed delivery milestones. We have paid the first two invoices and need help reviewing our options under the agreement.'],
 ['Grace Taylor','Lease renewal terms','Housing','Alberta',4,'My landlord sent a renewal with additional fees that were not in the original lease. I want help understanding the proposed changes.'],
 ['Aiden Campbell','Vehicle collision expenses','Personal injury','Quebec',5,'I have medical and travel expenses from a vehicle collision. The insurer has asked for supporting records before reviewing the claim.'],
 ['Sophie Lin','Final pay discrepancy','Employment','British Columbia',2,'My final pay did not match the remaining vacation balance. I kept the final statement and the earlier balance from payroll.'],
 ['Benjamin Patel','Injury at a recreation centre','Personal injury','British Columbia',3,'I was injured when a damaged step gave way at a recreation centre. I reported it that day and kept receipts for treatment.'],
 ['Layla Ahmed','Termination package review','Employment','Alberta',4,'I received a termination package and a deadline to sign a release. I need the employment agreement and proposed payment reviewed together.'],
 ['Mason Reed','Missing holiday pay','Employment','Ontario',0,'My last two pay statements appear to be missing holiday pay. Payroll has not answered my written requests for an explanation.'],
 ['Ava Wilson','Notice from landlord','Housing','Ontario',1,'I received a notice asking me to leave the apartment. I want help checking the notice and understanding how to respond.'],
 ['Arjun Mehta','Change in work hours','Employment','British Columbia',2,'My scheduled hours were reduced substantially without a new agreement. I have the original schedule and the recent written changes.'],
 ['Lily Zhang','Service cancellation charge','Contract dispute','British Columbia',3,'A service provider charged a cancellation fee that I cannot find in our signed agreement. I have the contract, invoices, and cancellation emails.'],
 ['Gabriel Cote','Repair requests','Housing','Quebec',5,'I have been asking for repairs to the bathroom ventilation and damaged window. I kept the requests and the responses from the property manager.'],
 ['Zara Ahmed','Dog bite expenses','Personal injury','Alberta',4,'A dog bit me while I was walking near my home. I have an incident report, treatment records, and receipts for related expenses.'],
 ['Theo Martin','Equipment purchase dispute','Contract dispute','Ontario',0,'Equipment delivered to my business does not match the purchase agreement. I recorded the defects and contacted the seller in writing.'],
 ['Mila Petrov','Move-out charges','Housing','British Columbia',2,'The property manager sent charges for damage after I moved out. I have the move-in inspection and dated photographs from the final day.'],
 ['Henry Clark','Injury on a staircase','Personal injury','Ontario',1,'I fell on a loose stair in a shared building and injured my ankle. I reported the stair before the fall and have the earlier correspondence.'],
 ['Fatima Ali','Unpaid training hours','Employment','Quebec',5,'I was required to attend training outside my scheduled shifts. Those hours are missing from my pay records.'],
 ['Daniela Costa','Rent increase notice','Housing','Alberta',4,'I received a rent increase notice and want help checking the timing and the terms in my current lease.'],
 ['Victor Chen','Outstanding contractor invoice','Contract dispute','Alberta',null,'A customer has not paid for electrical work completed under a written estimate. I have the approved estimate and the completion records.'],
 ['Ruby Singh','Photography deposit','Contract dispute','Alberta',null,'A photographer cancelled the booking and has not returned the deposit. I kept the booking terms and the cancellation message.'],
 ['Leo Bennett','Installation agreement','Contract dispute','Alberta',null,'An installer supplied different equipment from the signed order. I have the order confirmation, delivery records, and messages about replacing it.'],
 ['Alice Laurent','Freelance writing payment','Contract dispute','Alberta',null,'A client used the articles I delivered but has not paid the agreed fee. I have the accepted proposal and the published work.'],
 ['David Chen','Disputed parking fees','Housing','Ontario',1,'My landlord added parking charges although parking was included when I signed the lease. I have the listing and original agreement.'],
 ['Imani Lewis','Dismissal after leave','Employment','British Columbia',2,'My employment ended soon after I returned from approved leave. I have the leave approval, dismissal letter, and recent performance reviews.'],
 ['Maxime Dubois','Home repair invoice','Contract dispute','Quebec',5,'A repair company sent an invoice substantially above its written quote. I did not approve the additional work they listed.'],
 ['Sara Ibrahim','Injury in a parking area','Personal injury','Alberta',4,'I was injured after stepping into an uncovered drain in a parking area. I reported it and have medical records and photographs.'],
 ['Jack Thompson','Unpaid expenses','Employment','Ontario',0,'My former employer has not reimbursed approved travel expenses. I have the receipts and the written approval.'],
 ['Mei Wong','Course refund dispute','Contract dispute','British Columbia',3,'A course provider cancelled several advertised sessions. I requested a refund and kept the enrolment terms and cancellation notices.'],
];
export const matters=entries.map(([name,title,category,region,firm,description],index)=>{
 const accepted=index<17,status=accepted?'accepted':index<28?'awaiting_firm_review':index<32?'pending_assignment':index<36?'declined':'closed';
 const progress=accepted?(index>=1&&index<=5?'open':index>=13?'closed':'in_progress'):null;
 const date=accepted?(progress==='open'?Date.UTC(2026,10,2,9+(index-1)*8):Date.UTC(2026,9,1+index,14)):index<28?Date.UTC(2026,10,2,9+(index-17)*8):index<32?Date.UTC(2026,10,3,9+(index-28)*12):index<36?Date.UTC(2026,9,30,9+(index-32)*12):Date.UTC(2026,9,16+index-36,14);
 return {index,id:stableId(3,101+index),plaintiffId:stableId(2,101+index),caseId:accepted?stableId(4,101+index):null,name,email:index===0?'nora@example.com':name.toLowerCase().replaceAll(' ','.')+'@example.com',title:[19,25,29,35].includes(index)?null:title,category,region,firm,status,progress,description,createdAt:new Date(date).toISOString()};
});
const labels={Employment:['Employment agreement','Pay records','Commission statement','Schedule and hours record','Email correspondence','Payment timeline','Case update'],Housing:['Lease agreement','Rent receipts','Landlord correspondence','Repair inspection record','Case update'], 'Personal injury':['Incident report','Treatment summary','Expense receipts','Insurance correspondence','Case update'], 'Contract dispute':['Service agreement','Invoice','Payment correspondence','Work completion record','Case update']};
const documentSlots=[...Array.from({length:34},(_,index)=>[index,0]),...Array.from({length:6},(_,i)=>[0,i+1]),...[1,2,3].map(i=>[2,i]),...[3,6,7,8,10,11,12].map(i=>[i,1])];
export const documents=documentSlots.map(([index,sequence],offset)=>{
 const matter=matters[index],label=labels[matter.category][sequence%labels[matter.category].length];
 const firmShared=sequence>0&&(sequence%2===0||index===2&&sequence===3);
 const former=index===2&&sequence===2;
 const firm=firmShared?(former?1:matter.firm):null;
 const hours=index===2&&sequence===3?80:sequence+1+(firmShared?24:0);
 const date=new Date(Date.parse(matter.createdAt)+hours*3600000).toISOString();
 return {id:stableId(6,offset+1),leadId:matter.id,plaintiffId:matter.plaintiffId,caseId:matter.caseId,fileName:label+'.pdf',firm,actor:firm===null?matter.plaintiffId:firmActors[firm],createdAt:date,name:matter.name,title:matter.title||`${matter.category} request`,category:matter.category,region:matter.region,description:matter.description,label};
});
export const routing=[['Employment','Ontario',0],['Contract dispute','Ontario',0],['Housing','Ontario',1],['Personal injury','Ontario',1],['Employment','British Columbia',2],['Housing','British Columbia',2],['Personal injury','British Columbia',3],['Contract dispute','British Columbia',3],['Employment','Alberta',4],['Housing','Alberta',4],['Personal injury','Alberta',4],...['Employment','Housing','Personal injury','Contract dispute'].map(category=>[category,'Quebec',5])];
export const transfers=[
 {id:stableId(8,1),index:0,from:0,to:1,status:'pending'},
 {id:stableId(8,2),index:1,from:1,to:0,status:'declined'},
 {id:stableId(8,3),index:2,from:1,to:5,status:'accepted'},
];

const noteBodies={
  Employment:['Compare the employment terms with the pay statements. Confirm the dates and calculation of the outstanding payment with the client.','The agreement and payment records are filed. Request the remaining payroll correspondence before preparing the next client update.'],
  Housing:['Compare the lease with the notices and repair correspondence. Confirm when the client first reported the issue.','The client supplied the lease and receipts. Check the inspection record against the latest correspondence before the next update.'],
  'Personal injury':['Confirm the incident date and the treatment timeline. Keep the insurer correspondence separate from expense receipts.','The treatment records are filed. Ask the client for the remaining receipts and confirm which expenses have already been submitted.'],
  'Contract dispute':['Compare the signed scope with the invoice and delivery records. Identify the items the parties agreed were completed.','The agreement and invoices are filed. Request the written approval or rejection of the disputed work before the next update.'],
 };
export const notes=Array.from({length:24},(_,i)=>{
 const m=matters[i%17],historical=i===19,firm=historical?1:m.firm;
 return {id:stableId(7,i+1),caseId:m.caseId,actor:firmActors[firm],firm,body:historical?'Prepared the intake summary before the transfer to Laurent Legal. The plaintiff documents are filed with the case.':`${m.title || m.category}: ${noteBodies[m.category][i>=17?1:0]}`,
  createdAt:new Date(Date.parse(m.createdAt)+(historical?26:m.index===2?76:m.progress==='open'?6+i%17:80+i)*3600000).toISOString()};
});
