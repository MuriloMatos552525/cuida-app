import Core
import Features
import SupabaseData
import SwiftUI

@main
struct CuidaApp: App {
    private let deps = CuidaApp.makeDependencies()

    var body: some Scene {
        WindowGroup {
            RootView(deps: deps)
        }
    }

    /// Usa o Supabase quando há URL e chave configuradas; senão, o modo de exemplo.
    private static func makeDependencies() -> Dependencies {
        let info = Bundle.main.infoDictionary ?? [:]
        guard
            let urlText = info["SUPABASE_URL"] as? String, let url = URL(string: urlText), url.host != nil,
            let key = info["SUPABASE_ANON_KEY"] as? String, !key.isEmpty
        else {
            return .demo()
        }
        let repos = SupabaseBackend.makeRepositories(url: url, anonKey: key)
        return Dependencies(auth: repos.auth, caregivers: repos.caregivers, pricing: repos.pricing,
                            bookings: repos.bookings, work: repos.work, safety: repos.safety, isDemo: false)
    }
}
