import Foundation

/// Client for the optional yt-dlp backend exposed by the repo's `serve.py`
/// (`GET /api/health` → `{"ytdlp": bool}`, `GET /api/fetch-audio?url=` → audio
/// stream). iOS can't run yt-dlp itself, so YouTube fetching works only when
/// that server is reachable — the Simulator hits it at `localhost`, a device
/// needs the Mac's LAN IP and `serve.py` bound to `0.0.0.0`.
struct YouTubeService {
    let baseURL: URL

    enum YTError: LocalizedError {
        case unreachable(host: String)
        case noYtdlp
        case server(String)
        var errorDescription: String? {
            switch self {
            case .unreachable(let host):
                "Couldn't reach the yt-dlp server at \(host). Start it with `python3 serve.py 8000` in the project folder."
            case .noYtdlp:
                "The server is running but yt-dlp isn't installed there (`brew install yt-dlp`)."
            case .server(let msg):
                msg
            }
        }
    }

    /// Whether the backend is up and has yt-dlp on PATH.
    func health() async -> Bool {
        let url = baseURL.appendingPathComponent("api/health")
        guard let (data, resp) = try? await URLSession.shared.data(from: url),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return false }
        return (json["ytdlp"] as? Bool) == true
    }

    /// Download the audio for `youtubeURL` to a local file and return its URL.
    func fetchAudio(youtubeURL: String) async throws -> URL {
        var comps = URLComponents(url: baseURL.appendingPathComponent("api/fetch-audio"),
                                  resolvingAgainstBaseURL: false)
        comps?.queryItems = [URLQueryItem(name: "url", value: youtubeURL)]
        guard let url = comps?.url else { throw YTError.server("Bad server URL.") }

        let (tempURL, response): (URL, URLResponse)
        do {
            (tempURL, response) = try await URLSession.shared.download(from: url)
        } catch {
            throw YTError.unreachable(host: baseURL.absoluteString)
        }

        guard let http = response as? HTTPURLResponse else {
            throw YTError.unreachable(host: baseURL.absoluteString)
        }
        guard (200..<300).contains(http.statusCode) else {
            // The server returns JSON `{ "error": ... }` on failure.
            if let data = try? Data(contentsOf: tempURL),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = json["error"] as? String {
                throw YTError.server(msg)
            }
            throw YTError.server("YouTube fetch failed (HTTP \(http.statusCode)).")
        }

        // Persist with an .m4a extension so AVAudioFile recognizes it.
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dest = docs.appendingPathComponent("youtube-audio.m4a")
        try? FileManager.default.removeItem(at: dest)
        try FileManager.default.moveItem(at: tempURL, to: dest)
        return dest
    }
}
