import Foundation

/// Dados de exemplo para rodar o app no simulador sem backend.
/// Os valores de tarifa são fictícios: as tarifas reais ainda não foram definidas.
public enum MockData {
    public static let city = "São Paulo"
    public static let home = Address(
        label: "Casa", street: "Rua Harmonia, 100 - Vila Madalena", city: city,
        coordinate: Coordinate(latitude: -23.5537, longitude: -46.6880)
    )

    public static func rule(for category: ServiceCategory) -> PricingRule {
        switch category {
        case .nanny:
            PricingRule(category: .nanny, city: city, hourlyRate: 3500, dailyRate: 25000, minimumHours: 3,
                        longStayDays: 5, longStayDiscountBp: 1000, travelBaseFee: 800, perKmRate: 150,
                        nightSurchargeBp: 2000, weekendSurchargeBp: 1500, holidaySurchargeBp: 5000,
                        extraDependentBp: 2500, specialtySurchargeBp: 1500, platformFeeBp: 1800)
        case .petSitter:
            PricingRule(category: .petSitter, city: city, hourlyRate: 2500, dailyRate: 15000, minimumHours: 1,
                        longStayDays: 5, longStayDiscountBp: 1000, travelBaseFee: 600, perKmRate: 150,
                        nightSurchargeBp: 2000, weekendSurchargeBp: 1000, holidaySurchargeBp: 5000,
                        extraDependentBp: 3000, specialtySurchargeBp: 1500, platformFeeBp: 1800)
        case .elderCare:
            PricingRule(category: .elderCare, city: city, hourlyRate: 4000, dailyRate: 28000, minimumHours: 4,
                        longStayDays: 5, longStayDiscountBp: 1000, travelBaseFee: 800, perKmRate: 150,
                        nightSurchargeBp: 2000, weekendSurchargeBp: 1500, holidaySurchargeBp: 5000,
                        extraDependentBp: 4000, specialtySurchargeBp: 2500, platformFeeBp: 1800)
        }
    }

    public static let specialties: [Specialty] = [
        Specialty(id: "primeiros-socorros-infantil", name: "Primeiros socorros infantis", category: .nanny),
        Specialty(id: "recem-nascidos", name: "Recém-nascidos", category: .nanny),
        Specialty(id: "neurodivergentes", name: "Crianças neurodivergentes", category: .nanny),
        Specialty(id: "caes-grande-porte", name: "Cães de grande porte", category: .petSitter),
        Specialty(id: "medicacao-pet", name: "Medicação para pets", category: .petSitter),
        Specialty(id: "gatos", name: "Gatos", category: .petSitter),
        Specialty(id: "medicamentos", name: "Administração de medicamentos", category: .elderCare),
        Specialty(id: "mobilidade-reduzida", name: "Mobilidade reduzida", category: .elderCare),
        Specialty(id: "tecnico-enfermagem", name: "Técnico de enfermagem", category: .elderCare),
    ]

    static func spec(_ id: String) -> Specialty { specialties.first { $0.id == id }! }

    static let checkedRecently = Date().addingTimeInterval(-40 * 86_400)

    public static let caregivers: [Caregiver] = [
        Caregiver(name: "Ana Paula Souza",
                  bio: "Pedagoga, 8 anos cuidando de crianças de 0 a 10 anos. Adoro atividades ao ar livre e leitura.",
                  categories: [.nanny], specialties: [spec("primeiros-socorros-infantil"), spec("recem-nascidos")],
                  rating: 4.9, reviewCount: 132, coordinate: Coordinate(latitude: -23.5610, longitude: -46.6820),
                  serviceRadiusKm: 10, isIdentityVerified: true, backgroundCheckedAt: checkedRecently),
        Caregiver(name: "Juliana Ferreira",
                  bio: "Estudante de psicologia, experiência com crianças autistas e TDAH.",
                  categories: [.nanny], specialties: [spec("neurodivergentes")],
                  rating: 4.8, reviewCount: 57, coordinate: Coordinate(latitude: -23.5480, longitude: -46.6990),
                  serviceRadiusKm: 8, isIdentityVerified: true, backgroundCheckedAt: checkedRecently),
        Caregiver(name: "Rafael Lima",
                  bio: "Apaixonado por cães, passeios diários e cuidados de hospedagem em casa.",
                  categories: [.petSitter], specialties: [spec("caes-grande-porte"), spec("medicacao-pet")],
                  rating: 4.95, reviewCount: 210, coordinate: Coordinate(latitude: -23.5590, longitude: -46.6700),
                  serviceRadiusKm: 6, isIdentityVerified: true, backgroundCheckedAt: checkedRecently),
        Caregiver(name: "Mariana Costa",
                  bio: "Cuido de gatos e cães pequenos. Envio fotos e atualizações a cada visita.",
                  categories: [.petSitter], specialties: [spec("gatos")],
                  rating: 4.7, reviewCount: 38, coordinate: Coordinate(latitude: -23.5650, longitude: -46.6920),
                  serviceRadiusKm: 5, isIdentityVerified: true, backgroundCheckedAt: checkedRecently),
        Caregiver(name: "Cláudia Ribeiro",
                  bio: "Técnica de enfermagem há 15 anos, especializada em idosos com Alzheimer.",
                  categories: [.elderCare], specialties: [spec("tecnico-enfermagem"), spec("medicamentos")],
                  rating: 4.9, reviewCount: 89, coordinate: Coordinate(latitude: -23.5500, longitude: -46.6750),
                  serviceRadiusKm: 12, isIdentityVerified: true, backgroundCheckedAt: checkedRecently),
        Caregiver(name: "José Almeida",
                  bio: "Cuidador de idosos com curso pelo SENAC. Acompanho em consultas e passeios.",
                  categories: [.elderCare], specialties: [spec("mobilidade-reduzida")],
                  rating: 4.6, reviewCount: 24, coordinate: Coordinate(latitude: -23.5420, longitude: -46.6900),
                  serviceRadiusKm: 10, isIdentityVerified: true, backgroundCheckedAt: checkedRecently),
    ]

    public static let reviews: [Review] = [
        Review(authorName: "Carla M.", rating: 5, tags: ["Pontual", "Carinhosa"],
               comment: "Meus filhos adoraram. Mandou atualizações a noite toda.", createdAt: Date().addingTimeInterval(-5 * 86_400)),
        Review(authorName: "Pedro H.", rating: 5, tags: ["Atenciosa"], comment: nil,
               createdAt: Date().addingTimeInterval(-12 * 86_400)),
        Review(authorName: "Luiza R.", rating: 4, tags: ["Pontual"],
               comment: "Muito cuidadosa, recomendo.", createdAt: Date().addingTimeInterval(-30 * 86_400)),
    ]
}
