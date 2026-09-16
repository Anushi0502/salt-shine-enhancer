import Combine
import Foundation
import AppKit
import SwiftUI

final class ReleaseStore: ObservableObject {
    @Published var seoMode = "gpt"
    @Published var seoScope = "all-products"
    @Published private(set) var status = "unknown"
    @Published private(set) var watcher = "unknown"
    @Published private(set) var model = "unknown"
    @Published private(set) var modelDetail = ""
    @Published private(set) var shardProgress = ""
    @Published private(set) var gptProgress = ""
    @Published private(set) var step = "No checkpoint loaded."
    @Published private(set) var stepIndex = "-"
    @Published private(set) var pid = "-"
    @Published private(set) var heartbeat = "-"
    @Published private(set) var heartbeatAge = "Waiting for heartbeat"
    @Published private(set) var activity = "Loading current operation..."
    @Published private(set) var releaseError = ""
    @Published private(set) var releaseStateSource = "release checkpoint"
    @Published private(set) var workflow = "GPT SEO"
    @Published private(set) var log = "Loading release log..."
    @Published private(set) var checkpointMessage = "Checkpoint state is loading."
    @Published private(set) var message = "Ready. Local release control is active."
    @Published private(set) var processActive = false
    @Published private(set) var canShowEarlier = false
    @Published private(set) var hiddenLogMessageCount = 0

    private let baseURL: URL
    private var timer: Timer?
    private let logPageSize = 15
    private var logLines: [String] = []
    private var logStart = 0
    private var logLoaded = false
    private var logFollowLatest = true
    private var controlServiceProcess: Process?
    private var lastControlServiceAttempt = Date.distantPast

    init(port: Int) {
        baseURL = URL(string: "http://127.0.0.1:\(port)")!
        startControlServiceIfNeeded(port: port)
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    deinit {
        timer?.invalidate()
    }

    var statusColor: Color {
        switch status.lowercased() {
        case "running": return .green
        case "failed": return .red
        case "waiting_for_network": return .orange
        case "completed": return .blue
        default: return .gray
        }
    }

    var progress: Double {
        let parts = stepIndex.split(separator: "/").compactMap { Double(String($0)) }
        guard parts.count == 2, parts[1] > 0 else { return 0 }
        return min(max(parts[0] / parts[1], 0), 1)
    }

    var resumeButtonTitle: String {
        let normalized = status.lowercased()
        guard ["failed", "interrupted", "paused", "waiting_for_network"].contains(normalized),
              let first = stepIndex.split(separator: "/").first,
              let step = Int(first), step > 0 else {
            return "Resume checkpoint"
        }
        return "Resume from step \(step)"
    }

    func refresh() {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/state"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "ts", value: String(Int(Date().timeIntervalSince1970 * 1000)))]
        guard let url = components?.url else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            guard let data, error == nil,
                  let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                if let error {
                    DispatchQueue.main.async {
                        self?.message = "State polling failed: \(error.localizedDescription)"
                        self?.startControlServiceIfNeeded()
                    }
                }
                return
            }
            let release = root["release"] as? [String: Any] ?? [:]
            let watcher = root["watcher"] as? [String: Any] ?? [:]
            let model = root["visualTaxonomyTraining"] as? [String: Any] ?? [:]
            let shard = root["visualTaxonomyShardTraining"] as? [String: Any] ?? [:]
            let gpt = root["gptSeoProgress"] as? [String: Any] ?? [:]
            let process = root["process"] as? [String: Any] ?? [:]
            let status = Self.string(release, "status", fallback: "unknown")
            let watcherStatus = (watcher["processActive"] as? Bool) == true ? "running" : "stopped"
            let index = Self.int(release, "stepIndex")
            let total = Self.int(release, "totalSteps")
            let stepLabel = Self.string(release, "stepLabel", fallback: "No checkpoint loaded.")
            let heartbeatValue = Self.string(release, "heartbeatAt", fallback: "")
            let stateSource = Self.string(root, "releaseStateSource", fallback: "release checkpoint")
            let releaseError = Self.releaseError(release)
            let modelStatus = Self.string(model, "status", fallback: "unknown")
            let rawModelDetail = Self.string(model, "reason", fallback: Self.string(model, "error", fallback: ""))
            let modelLabel = ["failed", "blocked"].contains(modelStatus.lowercased()) && rawModelDetail.range(of: "taxonomy mismatch|retrain|incompatible|stale", options: [.regularExpression, .caseInsensitive]) != nil
                ? "retrain required"
                : modelStatus
            let modelDetail = rawModelDetail
                .components(separatedBy: "\n")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .first { $0.range(of: "taxonomy|retrain|incompatible|Metal model", options: [.regularExpression, .caseInsensitive]) != nil && !$0.lowercased().hasPrefix("command failed:") } ?? ""
            let shardProgress = Self.shardProgress(shard)
            let gptProgress = Self.string(gpt, "message", fallback: "")
            let seoMode = Self.string(release, "seoMode", fallback: "unknown").lowercased()
            let seoScope = Self.string(release, "seoScope", fallback: "all-products")
            let active = (process["active"] as? Bool) ?? false
            let checkpointMessage: String
            if active {
                checkpointMessage = "Release is running. The watcher and retry stream are connected."
            } else if ["failed", "interrupted", "waiting_for_network"].contains(status.lowercased()) {
                checkpointMessage = "Release is stopped safely. Resume from the persisted checkpoint when the blocking gate is repaired."
            } else if status.lowercased() == "completed" {
                checkpointMessage = "Last release completed. A new run will use the same unified catalog graph."
            } else {
                checkpointMessage = "No active release process detected."
            }
            let log = Self.string(root, "log", fallback: "No release output yet.")
            DispatchQueue.main.async {
                guard let self else { return }
                self.status = status
                self.watcher = watcherStatus
                self.model = modelLabel
                self.modelDetail = modelDetail.replacingOccurrences(of: "^Error:\\s*", with: "", options: .regularExpression)
                self.shardProgress = shardProgress
                self.gptProgress = gptProgress
                let workflowLabel = seoMode == "gpt" ? "GPT SEO" : seoMode == "deterministic" ? "legacy deterministic" : "SEO mode pending"
                self.workflow = "\(workflowLabel) - \(seoScope == "new-products" ? "new products" : "all products")"
                self.step = index > 0 ? "\(index)/\(max(total, index)) \(stepLabel)" : stepLabel
                self.stepIndex = index > 0 ? "\(index)/\(max(total, index))" : "-"
                self.pid = active && Self.int(release, "pid") > 0 ? String(Self.int(release, "pid")) : "-"
                self.heartbeat = Self.localDateTime(heartbeatValue.isEmpty ? "-" : heartbeatValue)
                self.heartbeatAge = Self.heartbeatAge(heartbeatValue)
                self.activity = stepLabel
                self.releaseError = ["failed", "interrupted", "waiting_for_network"].contains(status.lowercased()) ? releaseError : ""
                self.releaseStateSource = stateSource
                self.updateLog(log)
                self.checkpointMessage = checkpointMessage
                self.processActive = active
                if self.message.hasPrefix("State polling failed:") {
                    self.message = "Connected to the local release service."
                }
            }
        }.resume()
    }

    func showEarlier() {
        guard logStart > 0 else { return }
        logStart = max(0, logStart - logPageSize)
        logFollowLatest = false
        publishLog()
    }

    func start(resume: Bool) {
        guard !processActive else {
            message = "A release is already active."
            return
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("api/start"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let payload: [String: Any] = [
            "profile": "catalog",
            "seoMode": seoMode,
            "seoScope": seoScope,
            "resume": resume,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        message = resume ? "Requesting guarded resume..." : "Requesting guarded release..."
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let httpCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let responseObject = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let apiError = responseObject?["error"] as? String
            DispatchQueue.main.async {
                guard let self else { return }
                if let error {
                    self.message = "Start failed: \(error.localizedDescription)"
                } else if httpCode >= 400 {
                    self.message = apiError ?? "Start failed with HTTP \(httpCode)."
                } else {
                    let actualMode = (responseObject?["seoMode"] as? String ?? self.seoMode).uppercased()
                    if resume, let persistedMode = responseObject?["seoMode"] as? String {
                        self.seoMode = persistedMode.lowercased()
                    }
                    if resume, let step = responseObject?["resumeFromStep"] as? Int {
                        self.message = "Resuming from step \(step) in \(actualMode) mode. Polling release and watcher output."
                    } else {
                        self.message = "Supervisor started. Polling release and watcher output."
                    }
                    self.refresh()
                }
            }
        }.resume()
    }

    func stop() {
        guard processActive else {
            message = "No active release was found."
            return
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("api/stop"))
        request.httpMethod = "POST"
        message = "Stopping release and preserving checkpoint..."
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let httpCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let responseObject = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let apiError = responseObject?["error"] as? String
            DispatchQueue.main.async {
                guard let self else { return }
                if let error {
                    self.message = "Stop failed: \(error.localizedDescription)"
                } else if httpCode >= 400 {
                    self.message = apiError ?? "Stop failed with HTTP \(httpCode)."
                } else {
                    self.message = "Release stop requested. The checkpoint is being preserved."
                    self.refresh()
                }
            }
        }.resume()
    }

    private static func string(_ object: [String: Any], _ key: String, fallback: String) -> String {
        if let value = object[key] as? String, !value.isEmpty { return value }
        return fallback
    }

    private static func int(_ object: [String: Any], _ key: String) -> Int {
        if let value = object[key] as? Int { return value }
        if let value = object[key] as? NSNumber { return value.intValue }
        return 0
    }

    private static func firstInt(_ object: [String: Any], _ keys: [String]) -> Int {
        for key in keys {
            let value = int(object, key)
            if value > 0 { return value }
        }
        return 0
    }

    private static func dictionaryCount(_ object: [String: Any], _ key: String) -> Int {
        (object[key] as? [String: Any])?.count ?? 0
    }

    private func startControlServiceIfNeeded(port: Int? = nil) {
        let port = port ?? Int(baseURL.port ?? 4177)
        guard Date().timeIntervalSince(lastControlServiceAttempt) >= 2 else { return }
        if let process = controlServiceProcess, process.isRunning { return }
        lastControlServiceAttempt = Date()
        let projectRoot = Bundle.main.bundleURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let script = projectRoot.appendingPathComponent("scripts/release-control-ui.mjs")
        guard FileManager.default.fileExists(atPath: script.path) else { return }
        let process = Process()
        let nodeCandidates = ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"]
        let nodePath = nodeCandidates.first { FileManager.default.isExecutableFile(atPath: $0) }
        if let nodePath {
            process.executableURL = URL(fileURLWithPath: nodePath)
            process.arguments = [script.path, "--ensure", "--port", String(port)]
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", script.path, "--ensure", "--port", String(port)]
        }
        process.currentDirectoryURL = projectRoot
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            controlServiceProcess = process
        } catch {
            message = "Local release service could not start: \(error.localizedDescription)"
        }
    }

    private static func localDateTime(_ value: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return value }
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.timeZone = .current
        formatter.dateStyle = .short
        formatter.timeStyle = .medium
        return formatter.string(from: date)
    }

    private static func heartbeatAge(_ value: String) -> String {
        guard !value.isEmpty else { return "No heartbeat" }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: value) ?? ISO8601DateFormatter().date(from: value) else { return "Heartbeat unavailable" }
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 60 { return "Updated \(seconds)s ago" }
        return "Updated \(seconds / 60)m ago"
    }

    private static func releaseError(_ object: [String: Any]) -> String {
        let details = [
            string(object, "error", fallback: ""),
            string(object, "stageError", fallback: ""),
            string(object, "stageStderr", fallback: ""),
            string(object, "lastError", fallback: ""),
        ]
        .filter { !$0.isEmpty }
        .joined(separator: "\n")
        let line = details
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { $0.range(of: "release stopped|catalog integrity|failed|error:", options: [.regularExpression, .caseInsensitive]) != nil } ?? ""
        return line.count > 320 ? String(line.prefix(317)) + "..." : line
    }

    private func updateLog(_ value: String) {
        let nextLines = Self.logLines(from: value)
        let appended = logLoaded && nextLines.count >= logLines.count && Array(nextLines.prefix(logLines.count)) == logLines
        let previousLastPageStart = max(0, logLines.count - logPageSize)
        let wasFollowingLatest = !logLoaded || logFollowLatest || logStart >= previousLastPageStart
        let nextLastPageStart = max(0, nextLines.count - logPageSize)
        if !appended {
            logStart = nextLastPageStart
            logFollowLatest = true
        } else if wasFollowingLatest {
            logStart = nextLastPageStart
            logFollowLatest = true
        } else {
            logStart = min(logStart, nextLastPageStart)
        }
        logLines = nextLines
        logLoaded = true
        publishLog()
    }

    private func publishLog() {
        log = logLines.dropFirst(logStart).joined(separator: "\n")
        canShowEarlier = logStart > 0
        hiddenLogMessageCount = logStart
    }

    private static func logLines(from value: String) -> [String] {
        let lines = value.components(separatedBy: .newlines)
        return lines.last == "" ? Array(lines.dropLast()) : lines
    }

    private static func shardProgress(_ object: [String: Any]) -> String {
        let phase = string(object, "phase", fallback: "")
        let current = string(object, "currentShard", fallback: "")
        let progress = object["currentProgress"] as? [String: Any] ?? [:]
        let completed = firstInt(progress, ["completedImages", "recordsWritten", "entriesProcessed", "imagesProcessed"])
        let total = firstInt(progress, ["totalImages", "totalRecords", "totalEntries"])
        let steps = int(progress, "steps")
        let totalSteps = int(progress, "totalSteps")
        let shardCount = max(
            int(object, "shardCount"),
            max(dictionaryCount(object, "adapterShards"), dictionaryCount(object, "embeddingShards"))
        )
        let adapterDone = (object["adapterShards"] as? [String: Any])?.values.compactMap { $0 as? [String: Any] }.filter { string($0, "status", fallback: "") == "purged" }.count ?? 0
        let entryText = completed > 0 && total > 0 ? " - \(completed)/\(total) entries" : ""
        if phase == "complete" { return "All visual shards complete; final model verification is pending." }
        if phase == "embedding-encoding" && !current.isEmpty && total > 0 {
            return "Embedding pass - shard \(current)/\(shardCount > 0 ? String(shardCount) : current) - \(completed)/\(total) images - adapter training \(adapterDone)/\(shardCount > 0 ? shardCount : adapterDone) complete"
        }
        if !current.isEmpty && totalSteps > 0 { return "Shard \(current)\(shardCount > 0 ? "/\(shardCount)" : "") - \(phase.isEmpty ? "running" : phase) - \(steps)/\(totalSteps) steps\(entryText)" }
        if !current.isEmpty && total > 0 { return "Shard \(current)\(shardCount > 0 ? "/\(shardCount)" : "") - \(phase.isEmpty ? "running" : phase) - \(completed)/\(total) images" }
        if !current.isEmpty { return "Shard \(current) - \(phase.isEmpty ? "running" : phase)" }
        return phase.isEmpty ? "" : "Visual training - \(phase)"
    }
}

struct MetricView: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.title3)
                .fontWeight(.semibold)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .allowsTightening(true)
            Text(label).font(.caption).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.primary.opacity(0.06))
        .cornerRadius(12)
    }
}

struct ReleaseControlView: View {
    @ObservedObject var store: ReleaseStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("SALT OPERATIONS").font(.caption).fontWeight(.bold).foregroundColor(.accentColor)
                        Text("Release Control").font(.system(size: 38, weight: .bold, design: .rounded))
                        Text("One guarded catalog graph for full runs, daily scheduling, watcher retries, and live readback.")
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 7) {
                        Label("Unified catalog", systemImage: "arrow.triangle.2.circlepath")
                            .font(.headline)
                            .foregroundColor(.accentColor)
                        Text("macOS operator surface")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                HStack(alignment: .top, spacing: 18) {
                    VStack(alignment: .leading, spacing: 16) {
                        GroupBox {
                            VStack(alignment: .leading, spacing: 14) {
                                Text("Unified catalog workflow")
                                    .font(.headline)
                                Text("The manual full-catalog entrypoint and the scheduled daily alias use the same release gates and checkpoint format.")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)

                                Picker("SEO mode", selection: $store.seoMode) {
                                    Text("GPT SEO").tag("gpt")
                                    Text("Normal SEO").tag("deterministic")
                                }
                                .pickerStyle(.menu)
                                .disabled(store.processActive)

                                Picker("SEO scope", selection: $store.seoScope) {
                                    Text("All active products").tag("all-products")
                                    Text("New products only").tag("new-products")
                                }
                                .pickerStyle(.menu)
                                .disabled(store.processActive)

                                Text(store.seoMode == "gpt"
                                    ? "GPT SEO processes 500 products per batch and protects GPT-written fields from overwrite. Resume uses the saved checkpoint mode and scope."
                                    : "Normal SEO uses deterministic catalog rules and never overwrites fields protected by a GPT SEO record.")
                                    .font(.caption)
                                    .foregroundColor(.secondary)

                                HStack(spacing: 10) {
                                    Button("Start release") { store.start(resume: false) }
                                        .buttonStyle(.borderedProminent)
                                        .keyboardShortcut("r", modifiers: [.command])
                                        .disabled(store.processActive)
                                    Button(store.resumeButtonTitle) { store.start(resume: true) }
                                        .buttonStyle(.bordered)
                                        .disabled(store.processActive)
                                    Button("Stop release") { store.stop() }
                                        .buttonStyle(.bordered)
                                        .tint(.red)
                                        .disabled(!store.processActive)
                                }
                                Text(store.message).font(.caption).foregroundColor(.secondary).textSelection(.enabled)
                            }
                            .padding(.top, 4)
                        }
                        .accessibilityLabel("Release controls")

                        GroupBox("Live status") {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(spacing: 9) {
                                    Circle().fill(store.statusColor).frame(width: 11, height: 11)
                                    Text(store.status.capitalized).font(.headline)
                                }
                                HStack(spacing: 8) {
                                    Label("Watcher", systemImage: "eye")
                                    Text(store.watcher.capitalized)
                                }
                                .font(.caption)
                                .foregroundColor(.secondary)
                                HStack(spacing: 8) {
                                    Label("Workflow", systemImage: "sparkles")
                                    Text(store.workflow)
                                }
                                .font(.caption)
                                .foregroundColor(.secondary)
                                HStack(spacing: 8) {
                                    Label("Metal model", systemImage: "cpu")
                                    Text(store.model.capitalized)
                                }
                                .font(.caption)
                                .foregroundColor(.secondary)
                                if !store.modelDetail.isEmpty {
                                    Text(store.modelDetail)
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                        .lineLimit(2)
                                }
                                if !store.shardProgress.isEmpty {
                                    Label(store.shardProgress, systemImage: "square.stack.3d.up")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                if !store.gptProgress.isEmpty {
                                    Label(store.gptProgress, systemImage: "sparkles.rectangle.stack")
                                        .font(.caption2)
                                        .foregroundColor(.purple)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Current operation")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                    Text(store.activity)
                                        .font(.subheadline.weight(.semibold))
                                        .fixedSize(horizontal: false, vertical: true)
                                    if !store.gptProgress.isEmpty {
                                        Text(store.gptProgress)
                                            .font(.caption2)
                                            .foregroundColor(.purple)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    Text("Heartbeat \(store.heartbeatAge) - \(store.releaseStateSource)")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                                .padding(10)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.primary.opacity(0.05))
                                .cornerRadius(10)
                                if !store.releaseError.isEmpty {
                                    Text(store.releaseError)
                                        .font(.caption2)
                                        .foregroundColor(.red)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                Text(store.step).font(.subheadline).foregroundColor(.secondary).lineLimit(2)
                                Text(store.checkpointMessage)
                                    .font(.caption)
                                    .foregroundColor(.accentColor)
                                    .fixedSize(horizontal: false, vertical: true)
                                ProgressView(value: store.progress)
                                    .tint(store.statusColor)
                                    .accessibilityLabel("Release progress")
                                    .accessibilityValue(store.stepIndex)
                                VStack(spacing: 8) {
                                    HStack(spacing: 8) {
                                        MetricView(label: "Step", value: store.stepIndex)
                                        MetricView(label: "Release PID", value: store.pid)
                                    }
                                    MetricView(label: "Heartbeat", value: store.heartbeat)
                                }
                            }
                            .padding(.top, 4)
                        }
                    }
                    .frame(minWidth: 440, maxWidth: 520, alignment: .topLeading)

                    VStack(alignment: .leading, spacing: 12) {
                        GroupBox("Release log") {
                            VStack(alignment: .leading, spacing: 12) {
                                VStack(alignment: .leading, spacing: 7) {
                                    HStack(spacing: 8) {
                                        Circle()
                                            .fill(store.statusColor)
                                            .frame(width: 9, height: 9)
                                        Text(store.status.capitalized)
                                            .font(.headline)
                                        Spacer()
                                        Text(store.heartbeatAge)
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                    Text(store.activity)
                                        .font(.subheadline.weight(.semibold))
                                        .fixedSize(horizontal: false, vertical: true)
                                    HStack(spacing: 7) {
                                        Text("Step \(store.stepIndex)")
                                        Text("Heartbeat \(store.heartbeat)")
                                        Text(store.releaseStateSource)
                                    }
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                    if !store.releaseError.isEmpty {
                                        Text(store.releaseError)
                                            .font(.caption2)
                                            .foregroundColor(.red)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                                .padding(10)
                                .background(Color.primary.opacity(0.05))
                                .cornerRadius(10)
                                HStack(spacing: 10) {
                                    if store.canShowEarlier {
                                        Button("Show earlier") { store.showEarlier() }
                                            .buttonStyle(.bordered)
                                    }
                                    Text(store.canShowEarlier ? "\(store.hiddenLogMessageCount) earlier messages hidden" : "Showing latest 15 messages")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                    Spacer()
                                }
                                TextEditor(text: .constant(store.log))
                                    .font(.system(.caption, design: .monospaced))
                                    .frame(minHeight: 420)
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.25)))
                                    .accessibilityLabel("Release and watcher log")
                            }
                            .padding(.top, 4)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
            .padding(28)
        }
        .frame(minWidth: 980, minHeight: 720)
        .background(Color(nsColor: NSColor.windowBackgroundColor))
    }
}

private func commandLinePort() -> Int {
    let arguments = CommandLine.arguments
    guard let index = arguments.firstIndex(of: "--port"), index + 1 < arguments.count,
          let port = Int(arguments[index + 1]), (1024...65535).contains(port) else { return 4177 }
    return port
}

@main
struct SALTReleaseControlApp: App {
    @StateObject private var store: ReleaseStore

    init() {
        _store = StateObject(wrappedValue: ReleaseStore(port: commandLinePort()))
    }

    var body: some Scene {
        WindowGroup("SALT Release Control") {
            ReleaseControlView(store: store)
        }
        .windowResizability(.contentSize)
    }
}
