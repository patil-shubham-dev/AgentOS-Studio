use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Command, Stdio};

use std::sync::Mutex;
use std::collections::HashMap;
use tauri::{
    menu::{MenuBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

mod browser;
use browser::BrowserManager;

#[derive(Serialize, Deserialize, Clone)]
struct UpdateStatusPayload {
    status: String,
    version: Option<String>,
    progress: Option<f64>,
}

#[tauri::command]
fn get_app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "AgenticOS",
        "version": "2.1.0",
        "identifier": "com.agenticos.studio",
        "description": "AgenticOS — Your AI operating system for development",
    })
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let check = updater.check().await.map_err(|e| e.to_string())?;

    match check {
        Some(update) => Ok(serde_json::json!({
            "updateAvailable": true,
            "version": update.version,
            "downloadUrl": update.download_url,
        })),
        None => Ok(serde_json::json!({
            "updateAvailable": false,
            "version": null,
            "downloadUrl": null,
        })),
    }
}

#[tauri::command]
async fn send_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn register_context_menu() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe_path.to_string_lossy().to_string();
    let quoted = format!("\"{}\" \"%V\"", exe_str);

    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);

    // Directory right-click
    let dir_key = hkcu
        .create_subkey(r"Software\Classes\Directory\shell\AgenticOS")
        .map_err(|e| format!("Failed to create key: {}", e))?;
    dir_key
        .0
        .set_value("", &"Open with AgenticOS")
        .map_err(|e| format!("Failed to set value: {}", e))?;
    dir_key
        .0
        .set_value("Icon", &exe_str)
        .map_err(|e| format!("Failed to set icon: {}", e))?;

    let cmd_key = hkcu
        .create_subkey(r"Software\Classes\Directory\shell\AgenticOS\command")
        .map_err(|e| format!("Failed to create command key: {}", e))?;
    cmd_key
        .0
        .set_value("", &quoted)
        .map_err(|e| format!("Failed to set command: {}", e))?;

    // Folder background
    let bg_key = hkcu
        .create_subkey(r"Software\Classes\Directory\Background\shell\AgenticOS")
        .map_err(|e| format!("Failed to create bg key: {}", e))?;
    bg_key
        .0
        .set_value("", &"Open with AgenticOS")
        .map_err(|e| format!("Failed to set bg value: {}", e))?;
    bg_key
        .0
        .set_value("Icon", &exe_str)
        .map_err(|e| format!("Failed to set bg icon: {}", e))?;

    let bg_cmd = hkcu
        .create_subkey(r"Software\Classes\Directory\Background\shell\AgenticOS\command")
        .map_err(|e| format!("Failed to create bg command key: {}", e))?;
    bg_cmd
        .0
        .set_value("", &quoted)
        .map_err(|e| format!("Failed to set bg command: {}", e))?;

    // Drives
    let drv_key = hkcu
        .create_subkey(r"Software\Classes\Drive\shell\AgenticOS")
        .map_err(|e| format!("Failed to create drive key: {}", e))?;
    drv_key
        .0
        .set_value("", &"Open with AgenticOS")
        .map_err(|e| format!("Failed to set drive value: {}", e))?;
    drv_key
        .0
        .set_value("Icon", &exe_str)
        .map_err(|e| format!("Failed to set drive icon: {}", e))?;

    let drv_cmd = hkcu
        .create_subkey(r"Software\Classes\Drive\shell\AgenticOS\command")
        .map_err(|e| format!("Failed to create drive command key: {}", e))?;
    drv_cmd
        .0
        .set_value("", &quoted)
        .map_err(|e| format!("Failed to set drive command: {}", e))?;

    // Notify Explorer (best-effort)
    let _ = std::process::Command::new("cmd")
        .args(["/c", "ie4uinit.exe", "-show"])
        .spawn();

    Ok(())
}

#[tauri::command]
fn unregister_context_menu() -> Result<(), String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let paths = [
        r"Software\Classes\Directory\shell\AgenticOS",
        r"Software\Classes\Directory\Background\shell\AgenticOS",
        r"Software\Classes\Drive\shell\AgenticOS",
    ];
    for path in &paths {
        let _ = hkcu.delete_subkey_all(*path);
    }
    Ok(())
}

#[tauri::command]
fn is_context_menu_registered() -> Result<bool, String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    match hkcu.open_subkey(r"Software\Classes\Directory\shell\AgenticOS") {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: Option<u64>,
    #[serde(rename = "lastModified")]
    last_modified: Option<u64>,
    children: Vec<FileEntry>,
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    fn read_dir_recursive(dir_path: &Path, root_path: &Path) -> Result<Vec<FileEntry>, String> {
        let mut entries = Vec::new();

        let dir = std::fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in dir {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let name = entry
                .file_name()
                .to_string_lossy()
                .to_string();
            let full_path = entry.path();

            // Get metadata once — provides file_type, size, and modified time
            let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
            let is_dir = metadata.is_dir();
            let size = if metadata.is_file() { Some(metadata.len()) } else { None };
            let last_modified = metadata.modified().ok().map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64
            });

            let relative_path = full_path
                .strip_prefix(root_path)
                .unwrap_or(&full_path)
                .to_string_lossy()
                .to_string()
                .replace('/', "\\");

            let children = if is_dir {
                read_dir_recursive(&full_path, root_path)?
            } else {
                Vec::new()
            };

            entries.push(FileEntry {
                name,
                path: relative_path,
                is_dir,
                size,
                last_modified,
                children,
            });
        }

        entries.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.cmp(&b.name)
            }
        });

        Ok(entries)
    }

    let root = Path::new(&path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    read_dir_recursive(root, root)
}

// ── Git Backend ──────────────────────────────────────────────────

#[derive(Serialize)]
struct GitStatusOutput {
    branch: String,
    changes: Vec<GitChange>,
    ahead: i32,
    behind: i32,
}

#[derive(Serialize)]
struct GitChange {
    path: String,
    status: String,
}

#[derive(Serialize)]
struct GitCommitOutput {
    hash: String,
    message: String,
    author: String,
    timestamp: String,
}

fn run_git(working_dir: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(working_dir)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.trim().to_string())
    }
}

#[tauri::command]
fn git_status(working_dir: String) -> Result<GitStatusOutput, String> {
    let out = run_git(&working_dir, &["status", "--porcelain", "-b"])?;
    let mut lines = out.lines().filter(|l| !l.is_empty());

    let branch_line = lines.next().unwrap_or("");
    let branch = if branch_line.starts_with("## ") {
        let rest = &branch_line[3..];
        rest.split("...").next().unwrap_or(rest).to_string()
    } else {
        "unknown".to_string()
    };

    let mut ahead = 0i32;
    let mut behind = 0i32;
    if let Some(bracket) = branch_line.split('[').nth(1) {
        let bracket = bracket.trim_end_matches(']');
        for part in bracket.split(',') {
            let part = part.trim();
            if let Some(n) = part.strip_prefix("ahead ") {
                ahead = n.trim().parse().unwrap_or(0);
            } else if let Some(n) = part.strip_prefix("behind ") {
                behind = n.trim().parse().unwrap_or(0);
            }
        }
    }

    let mut changes = Vec::new();
    for line in lines {
        if line.len() < 3 { continue; }
        changes.push(GitChange {
            path: line[3..].to_string(),
            status: line[..2].to_string(),
        });
    }

    Ok(GitStatusOutput { branch, changes, ahead, behind })
}

#[tauri::command]
fn git_log(working_dir: String, max_count: Option<i32>) -> Result<Vec<GitCommitOutput>, String> {
    let count = max_count.unwrap_or(20);
    let out = run_git(&working_dir, &[
        "log",
        &format!("--max-count={}", count),
        "--format=%H|%an|%aI|%s",
    ])?;

    Ok(out.lines()
        .filter(|l| !l.is_empty())
        .map(|l| {
            let parts: Vec<&str> = l.splitn(4, '|').collect();
            GitCommitOutput {
                hash: parts.get(0).unwrap_or(&"").to_string(),
                author: parts.get(1).unwrap_or(&"").to_string(),
                timestamp: parts.get(2).unwrap_or(&"").to_string(),
                message: parts.get(3).unwrap_or(&"").to_string(),
            }
        })
        .collect())
}

#[tauri::command]
fn git_diff(working_dir: String, file: String) -> Result<String, String> {
    run_git(&working_dir, &["diff", "--", &file])
}

#[tauri::command]
fn git_commit(working_dir: String, message: String) -> Result<String, String> {
    run_git(&working_dir, &["commit", "-m", &message])
}

#[tauri::command]
fn git_restore(working_dir: String, file: String) -> Result<String, String> {
    run_git(&working_dir, &["restore", &file])
}

#[tauri::command]
fn git_init(working_dir: String) -> Result<String, String> {
    run_git(&working_dir, &["init"])
}

#[tauri::command]
fn git_push(working_dir: String, remote: Option<String>, branch: Option<String>) -> Result<String, String> {
    let mut cmd = std::process::Command::new("git");
    cmd.arg("push").current_dir(&working_dir);
    if let Some(r) = remote { cmd.arg(r); }
    if let Some(b) = branch { cmd.arg(b); }
    let output = cmd.output().map_err(|e| format!("Failed to execute git: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
fn git_pull(working_dir: String, remote: Option<String>, branch: Option<String>) -> Result<String, String> {
    let mut cmd = std::process::Command::new("git");
    cmd.arg("pull").current_dir(&working_dir);
    if let Some(r) = remote { cmd.arg(r); }
    if let Some(b) = branch { cmd.arg(b); }
    let output = cmd.output().map_err(|e| format!("Failed to execute git: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
fn git_branch_list(working_dir: String) -> Result<Vec<String>, String> {
    let out = run_git(&working_dir, &["branch"])?;
    Ok(out.lines().filter(|l| !l.is_empty()).map(|l| l.to_string()).collect())
}

#[tauri::command]
fn git_checkout(working_dir: String, branch: String) -> Result<String, String> {
    run_git(&working_dir, &["checkout", &branch])
}

#[tauri::command]
fn git_add(working_dir: String, file: String) -> Result<String, String> {
    run_git(&working_dir, &["add", &file])
}

// ── Command Execution Backend ────────────────────────────────────

struct CommandStreamState {
    processes: Mutex<HashMap<String, u32>>,  // stream_id → pid
}

#[tauri::command]
fn kill_command(stream_id: String, state: tauri::State<'_, CommandStreamState>) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    if let Some(pid) = processes.remove(&stream_id) {
        let result = if cfg!(windows) {
            std::process::Command::new("taskkill")
                .args(&["/PID", &pid.to_string(), "/F"])
                .output()
        } else {
            std::process::Command::new("kill")
                .args(&["-TERM", &pid.to_string()])
                .output()
        };
        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to kill process {}: {}", pid, e)),
        }
    } else {
        Err(format!("No running process for stream '{}'", stream_id))
    }
}

#[tauri::command]
fn run_command(working_dir: String, command: String, _args: Vec<String>) -> Result<String, String> {
    let output = if cfg!(windows) {
        std::process::Command::new("cmd")
            .args(["/C", &command])
            .current_dir(&working_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
    } else {
        std::process::Command::new("sh")
            .args(["-c", &command])
            .current_dir(&working_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
    }
    .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        let combined = if stderr.is_empty() { stdout } else { stderr };
        Err(combined.trim().to_string())
    }
}

#[tauri::command]
fn run_command_stream(
    app: tauri::AppHandle,
    command: String,
    cwd: String,
    stream_id: String,
    state: tauri::State<'_, CommandStreamState>,
) -> Result<i32, String> {
    let effective_cwd = if cwd.is_empty() { "." } else { &cwd };

    let mut child = if cfg!(windows) {
        std::process::Command::new("cmd")
            .args(["/C", &command])
            .current_dir(effective_cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null())
            .spawn()
    } else {
        std::process::Command::new("sh")
            .args(["-c", &command])
            .current_dir(effective_cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .stdin(std::process::Stdio::null())
            .spawn()
    }
    .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let pid = child.id();
    state.processes.lock().unwrap().insert(stream_id.clone(), pid);

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app1 = app.clone();
    let sid1 = stream_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let _ = app1.emit(&format!("terminal-output:{}", sid1), &text);
                }
                Err(_) => break,
            }
        }
    });

    let app2 = app.clone();
    let sid2 = stream_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let _ = app2.emit(&format!("terminal-output:{}", sid2), &text);
                }
                Err(_) => break,
            }
        }
    });

    let exit_status = child.wait().map_err(|e| format!("Failed to wait for process: {}", e))?;
    let exit_code = exit_status.code().unwrap_or(-1);

    state.processes.lock().unwrap().remove(&stream_id);
    let _ = app.emit(&format!("terminal-complete:{}", stream_id), exit_code);

    Ok(exit_code)
}

// ── Debug Backend ────────────────────────────────────────────────

struct DebugSession {
    child: std::process::Child,
    inspector_url: String,
}

struct DebugState {
    sessions: Mutex<HashMap<String, DebugSession>>,
    next_id: Mutex<u64>,
}

#[tauri::command]
fn debug_launch(file_path: String, working_dir: String, state: tauri::State<'_, DebugState>) -> Result<String, String> {
    let mut child = std::process::Command::new("node")
        .args(["--inspect-brk", &file_path])
        .current_dir(&working_dir)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn node: {}", e))?;

    use std::io::{BufRead, BufReader};
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let reader = BufReader::new(stderr);

    let inspector_url = reader
        .lines()
        .filter_map(|l| l.ok())
        .find(|l| l.contains("ws://") || l.contains("http://"))
        .ok_or("Could not find inspector URL in output")?;

    let url = inspector_url
        .split_whitespace()
        .find(|s| s.starts_with("ws://"))
        .or_else(|| inspector_url.split_whitespace().find(|s| s.starts_with("http://")))
        .ok_or("Could not parse inspector URL")?;

    let mut next_id = state.next_id.lock().unwrap();
    *next_id += 1;
    let session_id = format!("session-{}", next_id);

    state.sessions.lock().unwrap().insert(session_id.clone(), DebugSession {
        child,
        inspector_url: url.to_string(),
    });

    Ok(format!("{}\n{}", url, session_id))
}

#[tauri::command]
fn debug_stop(session_id: String, state: tauri::State<'_, DebugState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
        let _ = session.child.wait();
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

// ── PTY Backend ──────────────────────────────────────────────────

struct PtySessionData {
    child: Child,
    stdin: ChildStdin,
}

struct PtyState {
    sessions: Mutex<HashMap<String, PtySessionData>>,
    next_id: Mutex<u64>,
}

#[tauri::command]
fn pty_spawn(
    app: tauri::AppHandle,
    shell: String,
    cwd: String,
    state: tauri::State<'_, PtyState>,
) -> Result<String, String> {
    let mut child = Command::new(&shell)
        .args(if shell.contains("bash") { &["-i"] as &[&str] } else { &[] as &[&str] })
        .current_dir(if cwd.is_empty() { "." } else { &cwd })
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn shell '{}': {}", shell, e))?;

    let stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

    let mut next_id = state.next_id.lock().unwrap();
    *next_id += 1;
    let session_id = format!("pty-{}", next_id);

    let app_clone = app.clone();
    let sid = session_id.clone();

    // Background thread: reads stdout and emits pty-output events
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let _ = app_clone.emit("pty-output", serde_json::json!({
                        "sessionId": sid,
                        "data": text,
                    }));
                }
                Err(_) => break,
            }
        }
        let _ = app_clone.emit("pty-exit", serde_json::json!({ "sessionId": sid }));
    });

    // Background thread: reads stderr and emits pty-output events
    let app_clone2 = app.clone();
    let sid2 = session_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    let _ = app_clone2.emit("pty-output", serde_json::json!({
                        "sessionId": sid2,
                        "data": text,
                    }));
                }
                Err(_) => break,
            }
        }
    });

    state.sessions.lock().unwrap().insert(session_id.clone(), PtySessionData { child, stdin });

    Ok(session_id)
}

#[tauri::command]
fn pty_write(session_id: String, data: String, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;
    session.stdin.write_all(data.as_bytes()).map_err(|e| format!("Write error: {}", e))?;
    session.stdin.flush().map_err(|e| format!("Flush error: {}", e))?;
    Ok(())
}

#[tauri::command]
fn pty_resize(session_id: String, cols: u16, rows: u16, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let _session = sessions.get(&session_id).ok_or("Session not found")?;
    // No-op for pipe-based PTY; real PTY (portable-pty) will resize the console buffer
    let _ = (cols, rows);
    Ok(())
}

#[tauri::command]
fn pty_kill(session_id: String, state: tauri::State<'_, PtyState>) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.stdin.flush();
        let _ = session.child.kill();
        let _ = session.child.wait();
        Ok(())
    } else {
        Err("Session not found".to_string())
    }
}

// ── Browser Commands ──

#[tauri::command]
async fn browser_launch(state: tauri::State<'_, BrowserManager>, url: String) -> Result<String, String> {
    state.launch(&url).await
}

#[tauri::command]
async fn browser_close(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<(), String> {
    state.close_session(&session_id).await
}

#[tauri::command]
async fn browser_navigate(state: tauri::State<'_, BrowserManager>, session_id: String, url: String) -> Result<browser::PageInfo, String> {
    state.navigate(&session_id, &url).await
}

#[tauri::command]
async fn browser_reload(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<browser::PageInfo, String> {
    state.reload(&session_id).await
}

#[tauri::command]
async fn browser_new_tab(state: tauri::State<'_, BrowserManager>, session_id: String, url: String) -> Result<browser::TabInfo, String> {
    state.new_tab(&session_id, &url).await
}

#[tauri::command]
async fn browser_close_tab(state: tauri::State<'_, BrowserManager>, session_id: String, tab_id: String) -> Result<(), String> {
    state.close_tab(&session_id, &tab_id).await
}

#[tauri::command]
async fn browser_switch_tab(state: tauri::State<'_, BrowserManager>, session_id: String, tab_id: String) -> Result<browser::PageInfo, String> {
    state.switch_tab(&session_id, &tab_id).await
}

#[tauri::command]
async fn browser_list_tabs(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<Vec<browser::TabInfo>, String> {
    state.list_tabs(&session_id).await
}

#[tauri::command]
async fn browser_click(state: tauri::State<'_, BrowserManager>, session_id: String, selector: String) -> Result<(), String> {
    state.click(&session_id, &selector).await
}

#[tauri::command]
async fn browser_type(state: tauri::State<'_, BrowserManager>, session_id: String, selector: String, text: String) -> Result<(), String> {
    if !selector.is_empty() {
        state.click(&session_id, &selector).await?;
    }
    state.type_text(&session_id, &text).await
}

#[tauri::command]
async fn browser_press_key(state: tauri::State<'_, BrowserManager>, session_id: String, key: String) -> Result<(), String> {
    state.press_key(&session_id, &key).await
}

#[tauri::command]
async fn browser_extract_content(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<String, String> {
    state.extract_content(&session_id).await
}

#[tauri::command]
async fn browser_extract_links(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<Vec<String>, String> {
    state.extract_links(&session_id).await
}

#[tauri::command]
async fn browser_screenshot(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<String, String> {
    let bytes = state.screenshot(&session_id).await?;
    Ok(base64_encode(&bytes))
}

#[tauri::command]
async fn browser_execute_js(state: tauri::State<'_, BrowserManager>, session_id: String, js: String) -> Result<String, String> {
    state.execute_js(&session_id, &js).await
}

#[tauri::command]
async fn browser_wait_for_element(state: tauri::State<'_, BrowserManager>, session_id: String, selector: String, timeout_ms: u64) -> Result<(), String> {
    state.wait_for_element(&session_id, &selector, timeout_ms).await
}

#[tauri::command]
async fn browser_get_page_info(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<browser::PageInfo, String> {
    state.get_page_info(&session_id).await
}

#[tauri::command]
async fn browser_double_click(state: tauri::State<'_, BrowserManager>, session_id: String, selector: String) -> Result<(), String> {
    state.double_click(&session_id, &selector).await
}

#[tauri::command]
async fn browser_hover(state: tauri::State<'_, BrowserManager>, session_id: String, selector: String) -> Result<(), String> {
    state.hover(&session_id, &selector).await
}

#[tauri::command]
async fn browser_get_url(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<String, String> {
    state.get_url(&session_id).await
}

#[tauri::command]
async fn browser_get_title(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<String, String> {
    state.get_title(&session_id).await
}

#[tauri::command]
async fn browser_get_text(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<String, String> {
    state.get_text(&session_id).await
}

#[tauri::command]
async fn browser_get_console_logs(state: tauri::State<'_, BrowserManager>, session_id: String) -> Result<Vec<String>, String> {
    state.get_console_logs(&session_id).await
}

#[tauri::command]
async fn browser_detect_browsers() -> Vec<browser::BrowserDetectInfo> {
    browser::detect_browsers()
}

#[tauri::command]
async fn browser_save_state(state: tauri::State<'_, BrowserManager>, path: String) -> Result<(), String> {
    state.save_state_to_file(&path).await
}

#[tauri::command]
async fn browser_load_state(state: tauri::State<'_, BrowserManager>, path: String) -> Result<Vec<browser::PersistedSessionData>, String> {
    state.load_state_from_file(&path).await
}

fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

pub fn run() {
    // Capture the folder path from command line args (context menu "Open with AgenticOS")
    let initial_path: Option<String> = std::env::args().nth(1);

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DebugState {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(0),
        })
        .manage(PtyState {
            sessions: Mutex::new(HashMap::new()),
            next_id: Mutex::new(0),
        })
        .manage(CommandStreamState {
            processes: Mutex::new(HashMap::new()),
        })
        .manage(BrowserManager::new())
        .setup(move |app| {
            // Emit the initial path to the webview if provided (from context menu)
            if let Some(path) = initial_path {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit(
                        "open-folder",
                        serde_json::json!({ "path": path }),
                    );
                }
            }

            // ── System Tray ─────────────────────────────────────────────────
            let file = SubmenuBuilder::new(app, "File")
                .text("new-file", "New File\tCtrl+N")
                .text("open-folder", "Open Folder\tCtrl+O")
                .separator()
                .text("settings", "Settings\tCtrl+,")
                .separator()
                .quit()
                .build()?;

            let edit = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            let view = SubmenuBuilder::new(app, "View")
                .text("toggle-sidebar", "Toggle Sidebar\tCtrl+B")
                .text("toggle-terminal", "Toggle Terminal\tCtrl+`")
                .separator()
                .text("zoom-in", "Zoom In\tCtrl++")
                .text("zoom-out", "Zoom Out\tCtrl+-")
                .text("zoom-reset", "Reset Zoom\tCtrl+0")
                .separator()
                .text("enter-fullscreen", "Enter Fullscreen\tF11")
                .build()?;

            let help = SubmenuBuilder::new(app, "Help")
                .text("about", "About AgenticOS")
                .text("check-updates", "Check for Updates\u{2026}")
                .separator()
                .text("documentation", "Documentation")
                .text("report-issue", "Report an Issue\u{2026}")
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file)
                .item(&edit)
                .item(&view)
                .item(&help)
                .build()?;

            app.set_menu(menu)?;

            // Build tray menu
            let tray_menu = MenuBuilder::new(app)
                .text("show-window", "Show AgenticOS")
                .separator()
                .quit()
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("AgenticOS")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show-window" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // ── Keyboard shortcut handler ──────────────────────────────────
            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let window = _app.get_webview_window("main");
                match event.id().as_ref() {
                    "toggle-sidebar" => {
                        if let Some(win) = window {
                            let _ = win.emit(
                                "menu-action",
                                serde_json::json!({ "action": "toggle-sidebar" }),
                            );
                        }
                    }
                    "toggle-terminal" => {
                        if let Some(win) = window {
                            let _ = win.emit(
                                "menu-action",
                                serde_json::json!({ "action": "toggle-terminal" }),
                            );
                        }
                    }
                    "about" => {
                        if let Some(win) = window {
                            let _ = win.emit(
                                "menu-action",
                                serde_json::json!({ "action": "show-about" }),
                            );
                        }
                    }
                    "check-updates" => {
                        let app_h = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            match app_h.updater() {
                                Ok(updater) => match updater.check().await {
                                    Ok(Some(_update)) => {
                                        let _ = app_h.emit(
                                            "update-status",
                                            UpdateStatusPayload {
                                                status: "available".into(),
                                                version: Some(_update.version.to_string()),
                                                progress: None,
                                            },
                                        );
                                    }
                                    Ok(None) => {
                                        let _ = app_h.emit(
                                            "update-status",
                                            UpdateStatusPayload {
                                                status: "up-to-date".into(),
                                                version: None,
                                                progress: None,
                                            },
                                        );
                                    }
                                    Err(e) => {
                                        let _ = app_h.emit(
                                            "update-status",
                                            UpdateStatusPayload {
                                                status: format!("error: {}", e),
                                                version: None,
                                                progress: None,
                                            },
                                        );
                                    }
                                },
                                Err(e) => {
                                    let _ = app_h.emit(
                                        "update-status",
                                        UpdateStatusPayload {
                                            status: format!("error: {}", e),
                                            version: None,
                                            progress: None,
                                        },
                                    );
                                }
                            }
                        });
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            check_for_updates,
            send_notification,
            register_context_menu,
            unregister_context_menu,
            is_context_menu_registered,
            list_directory,
            run_command,
            run_command_stream,
            kill_command,
            git_status,
            git_log,
            git_diff,
            git_commit,
            git_restore,
            git_init,
            git_push,
            git_pull,
            git_branch_list,
            git_checkout,
            git_add,
            debug_launch,
            debug_stop,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            browser_launch,
            browser_close,
            browser_navigate,
            browser_reload,
            browser_new_tab,
            browser_close_tab,
            browser_switch_tab,
            browser_list_tabs,
            browser_click,
            browser_type,
            browser_press_key,
            browser_extract_content,
            browser_extract_links,
            browser_screenshot,
            browser_execute_js,
            browser_wait_for_element,
            browser_get_page_info,
            browser_double_click,
            browser_hover,
            browser_get_url,
            browser_get_title,
            browser_get_text,
            browser_get_console_logs,
            browser_detect_browsers,
            browser_save_state,
            browser_load_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AgenticOS");
}
