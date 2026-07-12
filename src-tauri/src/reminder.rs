// 面试提醒检查
//
// 由前端通过 Tauri 命令 check_interview_reminders 定时调用（每 30 秒）。
// 检查所有已安排时间的面试，对比两个提醒时间点：
//   - 提前 1 天（24 小时）
//   - 提前 3 小时
// 返回需要提醒的面试列表，由前端弹出桌面通知。
// 通知发送后更新数据库标记防止重复。

use crate::db::Database;
use crate::models::Application;
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

/// 传给前端的提醒事件数据
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderEvent {
    pub application_id: String,
    pub company_name: String,
    pub job_title: String,
    pub stage: String,
    pub stage_label: String,
    pub interview_at: String,
    pub mode: String,
    pub mode_label: String,
    pub location: String,
    pub interviewer: String,
    pub when: String,
}

/// 检查到期的面试提醒，返回需要通知的事件列表
pub fn check_reminders(db: &Database) -> Result<Vec<ReminderEvent>, String> {
    let applications = db.get_applications()?;
    let now = Utc::now();
    let mut events = Vec::new();

    for app_record in &applications {
        let interviews = match &app_record.interviews {
            Some(i) => i.clone(),
            None => continue,
        };

        for (stage, schedule) in &interviews {
            let interview_time = match parse_rfc(&schedule.interview_at) {
                Some(t) => t,
                None => continue,
            };

            // 跳过已过去 1 小时以上的面试
            if now > interview_time + Duration::hours(1) {
                continue;
            }

            // 检查提前 1 天提醒
            let one_day_before = interview_time - Duration::days(1);
            if now >= one_day_before && !schedule.reminder_sent_1d.unwrap_or(false) {
                let event = build_event(app_record, stage, schedule, "1 天");
                db.mark_reminder_sent(&app_record.id, stage, "1d")?;
                events.push(event);
            }

            // 检查提前 3 小时提醒
            let three_hours_before = interview_time - Duration::hours(3);
            if now >= three_hours_before && !schedule.reminder_sent_3h.unwrap_or(false) {
                let event = build_event(app_record, stage, schedule, "3 小时");
                db.mark_reminder_sent(&app_record.id, stage, "3h")?;
                events.push(event);
            }
        }
    }

    Ok(events)
}

fn parse_rfc(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    s.parse::<DateTime<Utc>>().ok()
}

fn build_event(
    application: &Application,
    stage: &str,
    schedule: &crate::models::InterviewSchedule,
    when: &str,
) -> ReminderEvent {
    ReminderEvent {
        application_id: application.id.clone(),
        company_name: application.company_name.clone(),
        job_title: application.job_title.clone(),
        stage: stage.to_string(),
        stage_label: match stage {
            "technical" => "技术面",
            "hr" => "HR面",
            "boss" => "Boss面",
            _ => stage,
        }
        .to_string(),
        interview_at: schedule.interview_at.clone(),
        mode: schedule.mode.clone(),
        mode_label: match schedule.mode.as_str() {
            "online" => "线上",
            "offline" => "线下",
            _ => "",
        }
        .to_string(),
        location: schedule.location.clone(),
        interviewer: schedule.interviewer.clone().unwrap_or_default(),
        when: when.to_string(),
    }
}
