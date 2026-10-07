// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CuidaKit",
    defaultLocalization: "pt-BR",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "Core", targets: ["Core"]),
        .library(name: "DesignSystem", targets: ["DesignSystem"]),
        .library(name: "SupabaseData", targets: ["SupabaseData"]),
        .library(name: "Features", targets: ["Features"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0"),
    ],
    targets: [
        // Regras de negócio puras (só Foundation): modelos, preço, estados da reserva, contratos de dados.
        .target(name: "Core", path: "Sources/Core"),
        .testTarget(name: "CoreTests", dependencies: ["Core"], path: "Tests/CoreTests"),

        // Cores, tipografia e componentes visuais reutilizáveis.
        .target(name: "DesignSystem", path: "Sources/DesignSystem"),

        // Implementação dos repositórios usando o Supabase.
        .target(
            name: "SupabaseData",
            dependencies: ["Core", .product(name: "Supabase", package: "supabase-swift")],
            path: "Sources/SupabaseData"
        ),

        // Telas do app (cliente e cuidador).
        .target(name: "Features", dependencies: ["Core", "DesignSystem"], path: "Sources/Features"),
    ]
)
