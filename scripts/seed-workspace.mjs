import {copyFile,mkdir,stat,constants} from 'node:fs/promises';
import {resolve} from 'node:path';
import {firms,staff,matters,documents,routing,transfers,notes,firmActors,adminId,stableId} from '../db/workspace-data.mjs';

export async function seedWorkspace(client) {
 for(const firm of firms)await client.query('INSERT INTO firms(id,name)VALUES($1,$2)ON CONFLICT(id)DO NOTHING',[firm.id,firm.name]);
 for(const user of staff)await client.query('INSERT INTO users(id,name,email,role,firm_id,is_demo)VALUES($1,$2,$3,$4,$5,true)ON CONFLICT(id)DO NOTHING',[user.id,user.name,user.email,user.role,firms[user.firm].id]);
 for(const [category,region,firm]of routing)await client.query('INSERT INTO routing_rules(category,region,firm_id)VALUES($1,$2,$3)ON CONFLICT(category,region)DO NOTHING',[category,region,firms[firm].id]);
 const audit=async(id,lead,type,actor,before,after,date)=>client.query('INSERT INTO audit_events(id,lead_id,event_type,actor_user_id,before_values,after_values,created_at)VALUES($1,$2,$3,$4,$5,$6,$7)ON CONFLICT(id)DO NOTHING',[id,lead,type,actor,before,after,date]);
 for(const m of matters){
  await client.query("INSERT INTO users(id,name,email,role,is_demo)VALUES($1,$2,$3,'plaintiff',$4)ON CONFLICT(id)DO NOTHING",[m.plaintiffId,m.name,m.email,m.index===0]);
  const firm=m.firm===null||m.status==='closed'?null:firms[m.firm].id;
  await client.query('INSERT INTO leads(id,plaintiff_id,name,email,title,category,region,description,status,firm_id,created_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)ON CONFLICT(id)DO NOTHING',[m.id,m.plaintiffId,m.name,m.email,m.title,m.category,m.region,m.description,m.status,firm,m.createdAt]);
  const created=Date.parse(m.createdAt),at=hours=>new Date(created+hours*3600000).toISOString(),original=m.index===2?1:m.firm;
  if(m.caseId)await client.query("INSERT INTO cases(id,lead_id,status,created_at)SELECT $1,id,$3,$4 FROM leads WHERE id=$2 AND status='accepted' ON CONFLICT DO NOTHING",[m.caseId,m.id,m.progress,at(2)]);
  if(original!==null)await audit(stableId(5,1000+m.index*10),m.id,m.index===2?'lead_assigned':'lead_routed',m.index===2?adminId:null,null,{firmId:firms[original].id,firmName:firms[original].name,status:'awaiting_firm_review'},m.createdAt);
  if(m.caseId){await audit(stableId(5,1001+m.index*10),m.id,'lead_accepted',firmActors[original],{status:'awaiting_firm_review'},{status:'accepted',caseId:m.caseId,caseStatus:'open'},at(2));
   if(m.progress!=='open')await audit(stableId(5,1002+m.index*10),m.id,'case_status_changed',firmActors[m.firm],{caseStatus:'open'},{caseStatus:'in_progress'},at(48));
   if(m.progress==='closed')await audit(stableId(5,1003+m.index*10),m.id,'case_status_changed',firmActors[m.firm],{caseStatus:'in_progress'},{caseStatus:'closed'},at(240));
  }else if(['declined','closed'].includes(m.status)){await audit(stableId(5,1001+m.index*10),m.id,'lead_declined',firmActors[m.firm],{status:'awaiting_firm_review'},{status:'declined'},at(8));if(m.status==='closed')await audit(stableId(5,1002+m.index*10),m.id,'lead_closed',adminId,{status:'declined',firmName:firms[m.firm].name},{status:'closed',firmName:null},at(24));}
 }
 for(const t of transfers){const m=matters[t.index],created=t.status==='pending'?'2026-11-05T14:00:00.000Z':new Date(Date.parse(m.createdAt)+72*3600000).toISOString(),decided=new Date(Date.parse(created)+3600000).toISOString();
  await client.query(`INSERT INTO case_transfers(id,case_id,from_firm_id,to_firm_id,status,offered_by,decided_by,created_at,decided_at)
    SELECT $1,c.id,$3,$4,$5,$6,$7,$8,$9 FROM cases c JOIN leads l ON l.id=c.lead_id WHERE c.id=$2 AND l.firm_id=$10
    AND NOT EXISTS(SELECT 1 FROM case_transfers existing WHERE existing.case_id=c.id AND existing.id<>$1)
    ON CONFLICT(id)DO NOTHING`,[t.id,m.caseId,firms[t.from].id,firms[t.to].id,t.status,adminId,t.status==='pending'?null:firmActors[t.to],created,t.status==='pending'?null:decided,firms[m.firm].id]);
  await audit(stableId(5,5000+t.index*10),m.id,'case_transfer_offered',adminId,{firmName:firms[t.from].name},{firmName:firms[t.from].name,proposedFirmName:firms[t.to].name,transferStatus:'pending'},created);
  const notice=t.status==='accepted'?`${firms[t.to].name} accepted the transfer and is now handling your case. Its progress is unchanged.`:t.status==='declined'?`${firms[t.to].name} declined the transfer. ${firms[t.from].name} continues handling your case while an administrator reviews the next step.`:`${firms[t.to].name} is reviewing a transfer offer for your case. ${firms[t.from].name} continues handling it until another firm accepts.`;
  await client.query('INSERT INTO plaintiff_notices(id,lead_id,message,created_at)VALUES($1,$2,$3,$4)ON CONFLICT(id)DO NOTHING',[stableId(9,t.index+1),m.id,notice,t.status==='pending'?created:decided]);
  if(t.status!=='pending')await audit(stableId(5,5001+t.index*10),m.id,`case_transfer_${t.status}`,firmActors[t.to],{firmName:firms[t.from].name,transferStatus:'pending'},{firmName:t.status==='accepted'?firms[t.to].name:firms[t.from].name,proposedFirmName:firms[t.to].name,transferStatus:t.status},decided);
 }
 for(const n of notes)await client.query('INSERT INTO firm_notes(id,case_id,author_user_id,firm_id,body,created_at)SELECT $1,id,$3,$4,$5,$6 FROM cases WHERE id=$2 ON CONFLICT(id)DO NOTHING',[n.id,n.caseId,n.actor,firms[n.firm].id,n.body,n.createdAt]);
 const directory=resolve(process.cwd(),'.data','documents');await mkdir(directory,{recursive:true,mode:0o700});
 for(const d of documents){const source=new URL(`../db/fixtures/documents/${d.id}.pdf`,import.meta.url),target=resolve(directory,`${d.id}.pdf`);await copyFile(source,target,constants.COPYFILE_EXCL).catch(error=>{if(error.code!=='EEXIST')throw error;});const size=(await stat(target)).size;await client.query('INSERT INTO documents(id,lead_id,uploader_user_id,sharing_firm_id,file_name,storage_key,size_bytes,created_at)VALUES($1,$2,$3,$4,$5,$1,$6,$7)ON CONFLICT(id)DO NOTHING',[d.id,d.leadId,d.actor,d.firm===null?null:firms[d.firm].id,d.fileName,size,d.createdAt]);}
}
