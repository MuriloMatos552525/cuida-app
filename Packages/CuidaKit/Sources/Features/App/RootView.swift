import Core
import DesignSystem
import SwiftUI

/// Primeira tela do app: decide entre login, escolha de perfil, modo cliente ou modo cuidador.
public struct RootView: View {
    @State private var model: AppModel

    public init(deps: Dependencies) {
        _model = State(initialValue: AppModel(deps: deps))
    }

    public var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView()
            case .signedOut:
                PhoneLoginView()
            case .choosingRole:
                RolePickerView()
            case .client:
                ClientTabView()
            case .caregiver:
                CaregiverTabView()
            }
        }
        .environment(model)
        .tint(Theme.accent)
        .task { await model.start() }
        .animation(.default, value: model.phase)
    }
}
