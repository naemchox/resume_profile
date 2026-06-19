---
name: swiftui-component-library
description: SwiftUI component reference skill compiled from exploreswiftui.com — copy-paste-ready code examples for 28+ component categories (Alert, AsyncImage, Button, List, TabView, Sheet, Picker, Gauge, Liquid Glass effects, and more) with OS availability for iOS, iPadOS, macOS, watchOS, tvOS, and visionOS. Use when writing or reviewing SwiftUI views to pick the right component, initializer, style, or modifier.
---

# SwiftUI Component Library

A visual-library-derived reference of SwiftUI components with ready-to-use code. Source: https://exploreswiftui.com/ ("Copy, paste, and ship"). Each entry lists what it demonstrates, minimum OS availability, and the full code example.

## How to use this skill

- Find the component category below, pick the closest example, and adapt names/bindings to the codebase.
- Availability annotations matter: anything marked 26.0+ requires the Liquid Glass era SDKs (Xcode 26 / iOS 26); 27.0+ requires iOS 27 SDKs. Guard with `if #available(...)` when targeting older OS versions.
- `action`, `sheetContent`, `smallRect`, `loremIpsum`, and `.cats` image assets in examples are placeholders — substitute real implementations.
- WWDC25 introduced Liquid Glass APIs (`glassEffect`, `GlassEffectContainer`, `ToolbarSpacer`, `tabViewBottomAccessory`, `ConcentricRectangle`). WWDC26 (iOS 27) introduced new Alert conveniences and the URL-request-based AsyncImage APIs.

---

## Alert

### Message Error Alert
Presents an alert with a message when an error state is present. (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
enum FooError: LocalizedError {
    case bar

    var errorDescription: String? {
        switch self {
            case .bar:
            return "Bar error occurred."
        }
    }

    var message: String {
        switch self {
            case .bar:
            return "This is a message for the Bar error."
        }
    }
}

@State private var error: FooError? = .bar

var body: some View {
    Text("Foo")
        .alert(error: $error) { errorItem in
            Button("OK") {
                print("\(errorItem) nilled")
            }
        } message: { errorItem in
            Text(errorItem.message)
        }
}
```

### Message Item Alert
Presents an alert with a message using the given data to produce the alert's content and a localized string key for a title. (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
struct Item {
    let message: String
}

@State var item: Item? = .init(message: "Foo")

var body: some View {
    Text("Foo")
        .alert("Title", item: $item) { alertItem in
            Button("Ok") {
                print("Item nilled")
            }
        } message: { alertItem in
            Text(alertItem.message)
        }
}
```

### Item Alert
Presents an alert using the given data to produce the alert's content with a title. (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
struct Item {}

@State var item: Item? = .init()

var body: some View {
    Text("Foo")
        .alert("Title", item: $item) { alertItem in
            Button("Ok") {
                print("Item nilled")
            }
        }
}
```

### Error Alert
Presents an alert when an error is present. (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
enum FooError: LocalizedError {
    case bar

    var errorDescription: String? {
        switch self {
            case .bar:
            return "Bar error occurred."
        }
    }
}

@State private var error: FooError? = .bar

var body: some View {
    Text("Foo")
        .alert(error: $error) {
            Button("OK") {
                print("Error nilled")
            }
        }
}
```

## AsyncImage

### Custom Session Async URL Image
Adds a custom URL session for asynchronous images contained in the view to use when fetching image data. (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
let imageURL = URL(string: "https://exploreswiftui.com/images/cats.jpg")!
let imageSession: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.httpAdditionalHeaders = [
        "X-Custom-Header": "CustomValue"
    ]

    return URLSession(configuration: configuration)
}()

var body: some View {
    AsyncImage(request: URLRequest(url: imageURL)) { image in
        image
    } placeholder: {
        ProgressView()
    }
    .asyncImageURLSession(imageSession)
}
```

### Custom Placeholder Async URL Image
Loads and displays an image from a URL request using AsyncImage with a custom placeholder shown while the image loads. (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
VStack {
    AsyncImage(request: URLRequest(url: slowURL)) { image in
        image.resizable(resizingMode: .tile)
            .resizable()
            .scaledToFit()
    } placeholder: {
        ProgressView()
    }

    AsyncImage(request: URLRequest(url: imageURL)) { image in
        image.resizable(resizingMode: .tile)
            .resizable()
            .scaledToFit()
    } placeholder: {
        ProgressView()
    }
    .frame(height: 100)
}
```

### Custom Phases Async URL Image
Loads and displays a modifiable image from the specified URL load request in phases (loading, success, failure). (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
VStack {
    AsyncImage(url: URL(string: "http://slowww.rf.gd")!) { phase in
        if let image = phase.image {
            image
        } else if phase.error != nil {
            Color.red
        } else {
            ProgressView()
        }
    }
    AsyncImage(url: URL(string: "https://exploreswiftui.com")!) { phase in
        if let image = phase.image {
            image
        } else if phase.error != nil {
            Color.red
        } else {
            ProgressView()
        }
    }
    .frame(height: 100)
    AsyncImage(url: URL(string: "https://exploreswiftui.com/images/cats.jpg")!) { phase in
        if let image = phase.image {
            image
                .resizable()
                .scaledToFit()
        } else if phase.error != nil {
            Color.red
        } else {
            ProgressView()
        }
    }
    .frame(height: 100)
}
```

### Async URL Image
Loads and displays an image from the specified URL load request using AsyncImage. (iOS 27.0+, iPadOS 27.0+, macOS 27.0+, watchOS 27.0+, tvOS 27.0+, visionOS 27.0+)
```swift
let imageURL = URL(string: "https://exploreswiftui.com/images/cats.jpg")!

var body: some View {
    AsyncImage(request: URLRequest(url: imageURL))
}
```

## Toolbars

### ToolbarSpacer
A standard space item in toolbars used to position toolbar buttons with fixed or flexible spacing. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+)
```swift
content
  .toolbar {
  ToolbarItemGroup(placement: .primaryAction) {
    Button("Up", systemImage: "chevron.up", action: action)
    Button("Down", systemImage: "chevron.down", action: action)
  }
  ToolbarSpacer(.fixed, placement: .primaryAction)
  ToolbarItem(placement: .primaryAction) {
    Button("Settings", systemImage: "ellipsis", action: action)
  }
}
```

### ToolbarItem Shared Background Visibility
Controls the visibility of the shared glass background effect applied to a toolbar item. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+)
```swift
NavigationStack {
  Text("Foo")
    .toolbar {
    ToolbarItem {
      Button("Account", systemImage: "person.circle", action: action)
    }
    ToolbarItem {
      Button("Account", systemImage: "person.circle", action: action)
    }
    .sharedBackgroundVisibility(.hidden)
  }
}
```

### Title Toolbar Item Placement
Places toolbar item content in the title area of navigation toolbars using title-related placement options. (iOS 26.0+, iPadOS 26.0+)
```swift
NavigationStack {
  Text("Foo")
    .toolbar {
    ToolbarItem(placement: .largeTitle) {
      Text("1")
    }
    ToolbarItem(placement: .title) {
      Text("2")
    }
    ToolbarItem(placement: .subtitle) {
      Text("3")
    }
    ToolbarItem(placement: .largeSubtitle) {
      Text("4")
    }
  }
}
```

## ScrollView

### Hard ScrollEdgeEffect
Applies a scroll edge effect with a hard cutoff and dividing line to scrollable content. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+)
```swift
NavigationStack {
  List {
    ForEach(0 ..< 100, id: \.self) {
      Text("Item \($0)")
    }
  }
  .toolbar {
    Button("foo", action: action)
  }
  .scrollEdgeEffectStyle(.hard, for: .all)
}
```

## Navigation

### Navigation Subtitle
Configures the view's subtitle for purposes of navigation, using a localized string. (iOS 26.0+, iPadOS 26.0+, macOS 11.0+)
```swift
NavigationStack {
    Text("Foo")
        .navigationTitle("Foo")
        .navigationSubtitle("Bar")
}
```

## Button

### Role Button With Default Label
Buttons with semantic roles (cancel, close, confirm, destructive) that get default system labels in standard layouts and toolbars. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
NavigationStack {
    VStack {
        Button(role: .cancel, action: action)
        Button(role: .close, action: action)
        Button(role: .confirm, action: action)
        Button(role: .destructive, action: action)
        Spacer()
    }
    .toolbar {
        Button(role: .cancel, action: action)
        Button(role: .close, action: action)
        Button(role: .confirm, action: action)
        Button(role: .destructive, action: action)
    }
}
```

### Button
Three ways to initialize a button with different parameter configurations. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
HStack {
    Button("Tap Me", action: action)
    Button("Tap Me", systemImage: "hand.tap", action: action)
        .padding(.horizontal)
    Button(action: action) {
        Text("Tap Me")
        Image(systemName: "hand.tap")
    }
}
```

### Glass Button Styles
Button styles that apply glass border artwork based on the button's context. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
VStack {
  HStack {
    Button("Tap Me", action: action)
      .buttonStyle(.glass)
    Button("Tinted Tap Me", action: action)
      .buttonStyle(.glass)
      .tint(.red)
  }
  HStack {
    Button("Tap Me", action: action)
      .buttonStyle(.glassProminent)
    Button("Tap Me", action: action)
      .buttonStyle(.glassProminent)
      .tint(.red)
  }
}
```

### Button Tint
Sets the button's tint color across the different button styles. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
VStack {
    HStack {
        Button("Tap Me", action: action)
            .buttonStyle(.plain)
        Button("Tap Me", action: action)
            .buttonStyle(.borderless)
        Button("Tap Me", action: action)
            .buttonStyle(.bordered)
        Button("Tap Me", action: action)
            .buttonStyle(.borderedProminent)
    }
    .tint(.blue)
    HStack {
        Button("Tap Me", action: action)
            .buttonStyle(.plain)
        Button("Tap Me", action: action)
            .buttonStyle(.borderless)
        Button("Tap Me", action: action)
            .buttonStyle(.bordered)
        Button("Tap Me", action: action)
            .buttonStyle(.borderedProminent)
    }
    .tint(.red)
    HStack {
        Button("Tap Me", action: action)
            .buttonStyle(.plain)
        Button("Tap Me", action: action)
            .buttonStyle(.borderless)
        Button("Tap Me", action: action)
            .buttonStyle(.bordered)
        Button("Tap Me", action: action)
            .buttonStyle(.borderedProminent)
    }
    .tint(.green)
}
```

### Button Roles
Button roles — a value describing the purpose of a button — across different button styles. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
VStack {
    HStack {
        Button("Tap Me", role: .cancel, action: action)
            .buttonStyle(.plain)
        Button("Tap Me", role: .cancel, action: action)
            .buttonStyle(.borderless)
        Button("Tap Me", role: .cancel, action: action)
            .buttonStyle(.bordered)
        Button("Tap Me", role: .cancel, action: action)
            .buttonStyle(.borderedProminent)
    }
    HStack {
        Button("Tap Me", role: .destructive, action: action)
            .buttonStyle(.plain)
        Button("Tap Me", role: .destructive, action: action)
            .buttonStyle(.borderless)
        Button("Tap Me", role: .destructive, action: action)
            .buttonStyle(.bordered)
        Button("Tap Me", role: .destructive, action: action)
            .buttonStyle(.borderedProminent)
    }
}
```

### Button Styles
The standard button styles that apply interaction behavior and appearance to all buttons in a view hierarchy. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
HStack {
    Button("Tap Me", action: action)
        .buttonStyle(.plain)
    Button("Tap Me", action: action)
        .buttonStyle(.borderless)
    Button("Tap Me", action: action)
        .buttonStyle(.bordered)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
}
```

### Button Sizing
Controls the preferred sizing behavior of buttons with the buttonSizing modifier. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
HStack {
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .buttonSizing(.fitted)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .buttonSizing(.flexible)
}
```

### RenameButton
A button that triggers a standard rename action via the renameAction modifier. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
@State private var text = "foo"

var body: some View {
    HStack {
        Text(text)

        RenameButton()
            .padding(.leading)
            .renameAction {
                text = "bar"
            }
        }
    }
```

### EditButton
A button that toggles the edit mode environment value to switch between viewing and editing states. (iOS 13.0+, iPadOS 13.0+, visionOS 1.0+)
```swift
@Environment(\.editMode) private var editMode
@State private var name = "Foo"

var body: some View {
    HStack {
        if editMode?.wrappedValue.isEditing == true {
            TextField("Name", text: $name)
        } else {
            Text(name)
        }
        EditButton()
    }
}
```

### PasteButton
A system button that reads items from the pasteboard and delivers them to a closure. (iOS 16.0+, iPadOS 16.0+, macOS 10.15+, visionOS 1.0+)
```swift
@State private var pastedText: String = ""

var body: some View {
    PasteButton(payloadType: String.self) { strings in
        pastedText = strings[0]
    }
}
```

### Button Border Shape
The buttonBorderShape modifier sets the shape used to draw a button's border. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
HStack {
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.roundedRectangle)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .padding()
        .buttonBorderShape(.circle)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.roundedRectangle(radius: 12))
}
```

## Link

### HelpLink
A button with standard macOS help appearance that opens app-specific help documentation when activated. (macOS 14.0+)
```swift
HelpLink {
  print("user requests help")
}
```

### TextFieldLink
A control that requests text input from the user when pressed. (watchOS 9.0+)
```swift
TextFieldLink("Set Text", prompt: Text("Custom Placeholder")) { str in
  print("Typed text: \(str)")
}
```

### Custom Preview Item ShareLink
Creates a ShareLink with a custom label, subject, message, and share preview. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, visionOS 1.0+)
```swift
ShareLink(
    "Share Cats",
    item: Image(.cats),
    subject: Text("Cool Photo"),
    message: Text("Check it out!"),
    preview: SharePreview(
        "Derpy Cats",
        image: Image(.cats)
    )
)
```

### ShareLink
A view that controls a sharing presentation, shown with three initialization styles. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, visionOS 1.0+)
```swift
HStack {
    ShareLink(item: URL(string: "https://exploreswiftui.com")!)
    ShareLink("Explore SwiftUI", item: URL(string: "https://exploreswiftui.com")!)
        .padding(.horizontal)
    ShareLink(item: URL(string: "https://exploreswiftui.com")!) {
        Label("Foo", systemImage: "cube.transparent")
    }
}
```

### Link
A control for navigating to a URL, with the openURL environment action customized. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
Link("Explore SwiftUI", destination: URL(string: "https://exploreswiftui.com")!)
    .environment(\.openURL, OpenURLAction { url in
        print("Open \(url)")
        return .handled
    })
```

## ControlGroup

### ControlGroup
Creates a new ControlGroup with the specified children. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, tvOS 17.0+, visionOS 1.0+)
```swift
ControlGroup {
    Button("Increase", action: action)
    Button("Decrease", action: action)
}
```

### PaletteControlGroupStyle
A control group style that presents its content as a palette. (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, visionOS 1.0+)
```swift
VStack {
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    } label: {
        Text("Foo")
    }
    ControlGroup("Foo", systemImage: "magnifyingglass") {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
}
.controlGroupStyle(.palette)
```

### NavigationControlGroupStyle
The navigation control group style, which presents related controls in a flat style. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, visionOS 1.0+)
```swift
VStack {
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    } label: {
        Text("Foo")
    }
    ControlGroup("Foo", systemImage: "magnifyingglass") {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
}
.controlGroupStyle(.navigation)
```

### MenuControlGroupStyle
A control group style that displays its content as a menu when pressed, or as a submenu within a larger menu. (iOS 16.4+, iPadOS 16.4+, macOS 13.3+, tvOS 17.0+, visionOS 1.0+)
```swift
VStack {
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    } label: {
        Text("Foo")
    }
    ControlGroup("Foo", systemImage: "magnifyingglass") {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
}
.controlGroupStyle(.menu)
```

### CompactMenuControlGroupStyle
A control group style that displays its content as a compact menu when the user presses the control, or as a submenu within a larger menu. (iOS 16.4+, iPadOS 16.4+, macOS 13.3+, visionOS 1.0+)
```swift
VStack {
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    } label: {
        Text("Foo")
    }
    ControlGroup("Foo", systemImage: "magnifyingglass") {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
    ControlGroup {
        Button("Increase", systemImage: "plus", action: action)
        Button("Decrease", systemImage: "minus", action: action)
    }
}
.controlGroupStyle(.compactMenu)
```

## Slider

### Slider
Creates a slider to select a value from a given range. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, visionOS 1.0+)
```swift
@State private var speed = 0.42

var body: some View {
  Slider(value: $speed)
}
```

### Stepped Slider
Creates a slider to select a value from a given range, subject to a step increment. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, visionOS 1.0+)
```swift
@State private var speed = 40.0
@State private var isEditing = false

var body: some View {
  Slider(
    value: $speed,
    in: 0 ... 100,
    step: 10,
    label: {
      Text("Foo") // for accessibility, enables ticks
    },
    onEditingChanged: { editing in
      isEditing = editing
    }
  )
}
```

### Stepped Min Max Label Slider
Creates a slider to select a value from a given range, subject to a step increment, which displays the provided labels. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, visionOS 1.0+)
```swift
@State private var speed = 42.0
@State private var isEditing = false

var body: some View {
    Slider(
        value: $speed,
        in: 0 ... 100,
        step: 10 // optional, by default 1,
    ) {
        Text("Foo") // for accessibility
    } minimumValueLabel: {
        Text("0")
    } maximumValueLabel: {
        Text("100")
    } onEditingChanged: { editing in // optional
        isEditing = editing
    }
}
```

### Custom Slider Ticks
Creates a slider with customizable ticks. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, visionOS 26.0+)
```swift
@State private var speed = 42.0

var body: some View {
    Slider(value: $speed) {
        Text("Foo")
    } ticks: {
        SliderTick(0.2)
        SliderTick(0.6)
        SliderTick(0.8)
    }
}
```

### SliderTickContentForEach
A slider tick content type that generates ticks by iterating over a collection. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, visionOS 26.0+)
```swift
Slider(value: $percentage) {
    Text("Percentage")
} currentValueLabel: {
    Text("\(percentage)%")
} ticks: {
    SliderTickContentForEach(
        stride(from: 0.0, through: 1.0, by: 0.25).map { $0 },
        id: \.self
    ) { value in
        SliderTick(value) {
            Text("value: \(value * 100)%")
        }
    }
}
.padding(.horizontal)
```

### Slider Color
Customizes the color of a slider by applying the tint modifier. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, visionOS 1.0+)
```swift
@State private var speed = 42.0
@State private var isEditing = false

var body: some View {
    VStack {
        Slider(
            value: $speed,
            in: 0 ... 100,
            step: 2 // optional, by default 1,
        )
        Slider(
            value: $speed,
            in: 0 ... 100,
            step: 2 // optional, by default 1,

        ) {
            Text("Foo") // for accessibility
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        } onEditingChanged: { editing in
            isEditing = editing
        }
    }
    .tint(.red)
}
```

## Picker

### Picker
Creates pickers with title, image, systemImage, and custom label variants. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
@State var selection = "1"
let pickerOptions = ["1", "2", "3"]

var body: some View {
    List {
        Picker("Foo", selection: $selection) {
            ForEach(pickerOptions, id: \.self) { option in
                Text(option)
            }
        }
        Picker("Bar", systemImage: "hand.tap", selection: $selection) {
            ForEach(pickerOptions, id: \.self) { option in
                Text(option)
            }
        }
        Picker("Bar", image: .cats24X24, selection: $selection) {
            ForEach(pickerOptions, id: \.self) { option in
                Text(option)
            }
        }
        Picker(selection: $selection) {
            ForEach(pickerOptions, id: \.self) { option in
                Text(option)
            }
        } label: {
            Label("Foo", systemImage: "star")
            Text("Bar")
        }
    }
}
```

### Custom Value Label Picker
A picker that generates its label from a localized string key and accepts a custom current value label. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 2.0+)
```swift
@State var selection = "1"
let pickerOptions = ["1", "2", "3"]

var body: some View {
    List {
        Picker("Foo", selection: $selection) {
            ForEach(pickerOptions, id: \.self) { option in
                Text(option)
            }
        } currentValueLabel: {
            Text("Current: \(selection)")
        }
    }
}
```

### Multiple Sources Picker
A picker that updates the selected property for all sources. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
enum SpecialProperty: String, CaseIterable, Identifiable {
    case small, medium, large
    var id: String { rawValue }
}

struct Cat: Identifiable {
    let id = UUID()
    var name: String
    var size: SpecialProperty
}

@State private var sources = [
    Cat(name: "Bella", size: .small),
    Cat(name: "Max", size: .large)
]

var body: some View {
    List {
        Picker("Size for all pets", sources: $sources, selection: \.size) {
            ForEach(SpecialProperty.allCases) { size in
                Text(size.rawValue).tag(size)
            }
        }

        ForEach(sources) { pet in
            Text("\(pet.name): \(pet.size.rawValue)")
        }
    }
}
```

### WheelPickerStyle
A picker style that presents the options in a scrollable wheel showing the selected option and a few neighboring options. (iOS 13.0+, iPadOS 13.0+, watchOS 6.0+, visionOS 1.0+)
```swift
List {
    Picker(selection: $selection) {
        Text("1")
            .tag("1")
        Section("Bar") {
            Text("2")
                .tag("2")
        }
        Label("3", systemImage: "3.circle")
            .tag("3")
    } label: {
        Label("Foo", systemImage: "hand.tap")
        Text("Bar")
    } currentValueLabel: {
        Text("Selected: \(selection)")
    }
    .pickerStyle(.wheel)
}
```

### SegmentedPickerStyle
A picker style that presents the options in a segmented control, recommended for two to five choices. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, tvOS 13.0+, visionOS 1.0+)
```swift
List {
    Picker(selection: $selection) {
        Text("1")
            .tag("1")
        Section("Bar") {
            Text("2")
                .tag("2")
        }
        Label("3", systemImage: "3.circle")
            .tag("3")
    } label: {
        Label("Foo", systemImage: "hand.tap")
        Text("Bar")
    } currentValueLabel: {
        Text("Selected: \(selection)")
    }
    .pickerStyle(.segmented)
}
```

### PalettePickerStyle
A picker style that presents the options as a row of compact elements, e.g. inside a menu. (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, visionOS 1.0+)
```swift
List {
    Menu("Test") {
        Picker(selection: $selection) {
            Text("1")
                .tag("1")
            Text("2")
                .tag("2")
            Section("Bar") {
                Text("3")
                    .tag("3")
                Text("4")
                    .tag("4")
            }
            Label("5", systemImage: "5.circle")
                .tag("5")
            Label("6", systemImage: "6.circle")
                .tag("6")
        } label: {
            Label("Foo", systemImage: "hand.tap")
            Text("Bar")
        } currentValueLabel: {
            Text("Selected: \(selection)")
        }
        .pickerStyle(.palette)
    }
}
```

### RadioGroupPickerStyle
A picker style that presents the options as a group of radio buttons. (macOS 10.15+)
```swift
Picker(selection: $selection) {
    Text("1")
        .tag("1")
    Section("Bar") {
        Text("2")
            .tag("2")
    }
    Label("3", systemImage: "3.circle")
        .tag("3")
} label: {
    Label("Foo", systemImage: "hand.tap")
    Text("Bar")
} currentValueLabel: {
    Text("Selected: \(selection)")
}
.pickerStyle(.radioGroup)
```

### NavigationLinkPickerStyle
A picker style that presents the options via a navigation link that pushes a List-style picker view. (iOS 16.0+, iPadOS 16.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
NavigationStack {
    List {
        Picker(selection: $selection) {
            Text("1")
                .tag("1")
            Section("Bar") {
                Text("2")
                    .tag("2")
            }
            Label("3", systemImage: "3.circle")
                .tag("3")
        } label: {
            Label("Foo", systemImage: "hand.tap")
            Text("Bar")
        } currentValueLabel: {
            Text("Selected: \(selection)")
        }
        .pickerStyle(.navigationLink)
    }
}
```

### MenuPickerStyle
A picker style that presents the options as a menu when the user presses a button, or as a submenu when nested within a larger menu. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, tvOS 17.0+, visionOS 1.0+)
```swift
List {
    Picker(selection: $selection) {
        Text("1")
            .tag("1")
        Section("Bar") {
            Text("2")
                .tag("2")
        }
        Label("3", systemImage: "3.circle")
            .tag("3")
    } label: {
        Label("Foo", systemImage: "hand.tap")
        Text("Bar")
    } currentValueLabel: {
        Text("Selected: \(selection)")
    }
    .pickerStyle(.menu)
}
```

### InlinePickerStyle
A picker style where each option is displayed inline with other views in the current container. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
List {
    Picker(selection: $selection) {
        Text("1")
            .tag("1")
        Section("Bar") {
            Text("2")
                .tag("2")
        }
        Label("3", systemImage: "3.circle")
            .tag("3")
    } label: {
        Label("Foo", systemImage: "hand.tap")
        Text("Bar")
    } currentValueLabel: {
        Text("Selected: \(selection)")
    }
    .pickerStyle(.inline)
}
```

### Wheel Picker Item Height
Sets the default wheel-style picker item height. (watchOS 6.0+)
```swift
Picker(selection: $selection) {
    Text("1")
        .tag("1")
    Section("Bar") {
        Text("2")
            .tag("2")
    }
    Label("3", systemImage: "3.circle")
        .tag("3")
} label: {
    Label("Foo", systemImage: "hand.tap")
    Text("Bar")
} currentValueLabel: {
    Text("Selected: \(selection)")
}
.defaultWheelPickerItemHeight(48)
```

### Horizontal Radio Group Layout
Applies a horizontal layout to radio-group-style pickers. (macOS 10.15+)
```swift
let picker = Picker(selection: $selection) {
    Text("1")
        .tag("1")
    Section("Bar") {
        Text("2")
            .tag("2")
    }
    Label("3", systemImage: "3.circle")
        .tag("3")
} label: {
    Label("Foo", systemImage: "hand.tap")
    Text("Bar")
} currentValueLabel: {
    Text("Selected: \(selection)")
}
.pickerStyle(.radioGroup)

picker

picker
    .horizontalRadioGroupLayout()
```

### Picker Section
Uses a Section inside a Picker to organize selectable options into grouped categories. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
List {
    Picker("Foo", selection: $selection) {
        Text("1")
            .tag("1")

        Section("Bar") {
            Text("2")
                .tag("2")
        }
        Text("3")
            .tag("3")
    }
}
```

### Picker Divider
Uses a Divider inside a Picker to separate groups of selectable options. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
List {
    Picker("Foo", selection: $selection) {
        Text("1")
            .tag("1")

        Divider()

        Text("2")
            .tag("2")
        Text("3")
            .tag("3")
    }
}
```

## DatePicker

### Future DatePicker
A multi-date picker restricted to selecting dates on or after a start date. (iOS 16.0+, iPadOS 16.0+, visionOS 1.0+)
```swift
@State private var dates: Set<DateComponents> = []

var body: some View {
    MultiDatePicker("Dates Available", selection: $dates, in: Date.now...)
}
```

### MultiDatePicker
A control for picking multiple dates. (iOS 16.0+, iPadOS 16.0+, visionOS 1.0+)
```swift
@State private var dates: Set<DateComponents> = []

var body: some View {
    MultiDatePicker("Dates Available", selection: $dates)
}
```

### Hour Minute Seconds DatePicker
A DatePicker for just hour, minute, and second. (watchOS 10.0+)
```swift
@State private var date = Date()

var body: some View {
  DatePicker("Select Date", selection: $date, displayedComponents: .hourMinuteAndSecond)
}
```

### DatePicker Components
Date pickers limited to specific displayed components, such as date-only or time-only selection. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 10.0+, visionOS 1.0+)
```swift
@State var date = Date()

var body: some View {
    VStack {
        DatePicker("Select Date", selection: $date, displayedComponents: .date)
        DatePicker("Select Date", selection: $date, displayedComponents: .hourAndMinute)
    }
}
```

### DatePicker
Creates an instance that selects a Date with an unbounded range. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 10.0+, visionOS 1.0+)
```swift
@State var date = Date()

var body: some View {
    DatePicker("Select Date", selection: $date)
}
```

### DatePicker Colors
Customizing the colors of the date picker using the tint modifier. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 10.0+, visionOS 1.0+)
```swift
@State var date = Date()

var body: some View {
    DatePicker("Select Date", selection: $date)
        .tint(.red)
}
```

### FieldDatePickerStyle
A date picker style that displays the components in an editable field. (macOS 10.15+)
```swift
@State var date = Date()

var body: some View {
    DatePicker("Select Date", selection: $date)
        .datePickerStyle(.field)
}
```

### StepperFieldDatePickerStyle
A system style displaying components in an editable field with an adjoining stepper to increment/decrement the selected component. (macOS 10.15+)
```swift
@State var date = Date()

var body: some View {
  DatePicker("Select Date", selection: $date)
    .datePickerStyle(.stepperField)
}
```

### WheelDatePickerStyle
A date picker style that displays each component as columns in a scrollable wheel. (iOS 13.0+, iPadOS 13.0+, watchOS 10.0+, visionOS 1.0+)
```swift
@State var date = Date()

var body: some View {
    DatePicker("Select Date", selection: $date)
        .datePickerStyle(.wheel)
}
```

### GraphicalDatePickerStyle
A date picker style that displays an interactive calendar or clock. (iOS 14.0+, iPadOS 14.0+, macOS 10.15+, visionOS 1.0+)
```swift
@State var date = Date()

var body: some View {
    DatePicker("Select Date", selection: $date, displayedComponents: .date)
        .datePickerStyle(.graphical)
}
```

## Gauge

### Min Max Current Value Gauge
A gauge showing a value within a range with labels for its current, minimum, and maximum values. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 7.0+, visionOS 1.0+)
```swift
Gauge(value: 0.42) {
    Text("Foo")
} currentValueLabel: {
    Text("42")
} minimumValueLabel: {
    Text("0")
} maximumValueLabel: {
    Text("100")
}
```

### Current Value Gauge
A gauge showing a value within a range that describes its purpose and current value. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 7.0+, visionOS 1.0+)
```swift
Gauge(value: 0.42) {
    Text("Foo")
} currentValueLabel: {
    Text("\(currentValue)")
}
```

### Gauge
A basic gauge showing a value within a range with a label describing its purpose. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 7.0+, visionOS 1.0+)
```swift
Gauge(value: 0.42) {
    Text("Foo")
}
```

### Gauge Colors
Customizing the colors of different gauge styles with tint gradients and foreground styles. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 7.0+, visionOS 1.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
    VStack {
        HStack {
            Gauge(value: currentValue) {
                Text("Foo")
            } currentValueLabel: {
                Text("42")
                    .foregroundColor(.indigo)
            } minimumValueLabel: {
                Text("0")
                    .foregroundColor(.mint)
            } maximumValueLabel: {
                Text("100")
                    .foregroundColor(.blue)
            }
            .gaugeStyle(.accessoryCircular)

            Gauge(value: currentValue) {
                Text("Foo")
            } currentValueLabel: {
                Text("42")
            } minimumValueLabel: {
                Text("0")
            } maximumValueLabel: {
                Text("100")
            }
            .gaugeStyle(.accessoryCircularCapacity)
        }
        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
        .gaugeStyle(.linearCapacity)
        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
        .gaugeStyle(.accessoryLinear)

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
        .gaugeStyle(.accessoryLinearCapacity)
    }
    .tint(Gradient(colors: [.green, .orange, .red]))
        .foregroundStyle(.brown)
}
```

### CircularGaugeStyle
A gauge style that displays an open ring with a marker at a point along the ring to indicate the current value. (watchOS 7.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
  HStack {
    Gauge(value: 0.42) {
      Text("Foo")
    }

    Gauge(value: currentValue) {
      Text("Foo")
    } currentValueLabel: {
      Text("\(currentValue)")
    }
    .padding(.horizontal)

    Gauge(value: currentValue) {
      Text("Foo")
    } currentValueLabel: {
      Text("42")
    } minimumValueLabel: {
      Text("0")
    } maximumValueLabel: {
      Text("100")
    }
  }
  .gaugeStyle(.circular)
}
```

### LinearGaugeStyle
A gauge style that displays a bar with a marker at a point along the bar to indicate the current value. (watchOS 7.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
  VStack {
    Gauge(value: 0.42) {
      Text("Foo")
    }

    Gauge(value: currentValue) {
      Text("Foo")
    } currentValueLabel: {
      Text("\(currentValue)")
    }
    .padding(.vertical)

    Gauge(value: currentValue) {
      Text("Foo")
    } currentValueLabel: {
      Text("42")
    } minimumValueLabel: {
      Text("0")
    } maximumValueLabel: {
      Text("100")
    }
  }
  .gaugeStyle(.linear)
}
```

### AccessoryLinearCapacityGaugeStyle
A gauge style that displays a bar that fills from leading to trailing edges as the current value increases. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, visionOS 1.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
    VStack {
        Gauge(value: currentValue) {
            Text("Foo")
        }

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("\(currentValue)")
        }
        .padding(.vertical)

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
    }
    .gaugeStyle(.accessoryLinearCapacity)
}
```

### AccessoryLinearGaugeStyle
A gauge style that displays a bar with a marker at a point along the bar to indicate the current value. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, visionOS 1.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
    VStack {
        Gauge(value: currentValue) {
            Text("Foo")
        }

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("\(currentValue)")
        }
        .padding(.vertical)

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
    }
    .gaugeStyle(.accessoryLinear)
}
```

### LinearCapacityGaugeStyle
A gauge style that displays a bar that fills from leading to trailing edges as the current value increases. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, visionOS 1.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
    VStack {
        Gauge(value: currentValue) {
            Text("Foo")
        }

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("\(currentValue)")
        }
        .padding(.vertical)

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
    }
    .gaugeStyle(.linearCapacity)
}
```

### AccessoryCircularCapacityGaugeStyle
A gauge style that displays a closed ring that is partially filled in to indicate the current value. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, visionOS 1.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
    HStack {
        Gauge(value: currentValue) {
            Text("Foo")
        }

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("\(currentValue)")
        }
        .padding(.horizontal)

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
    }
    .gaugeStyle(.accessoryCircularCapacity)
}
```

### AccessoryCircularGaugeStyle
A gauge style that displays an open ring with a marker at a point along the ring to indicate the current value. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, visionOS 1.0+)
```swift
@State private var currentValue = 0.42

var body: some View {
    HStack {
        Gauge(value: currentValue) {
            Text("Foo")
        }

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("\(currentValue)")
        }
        .padding(.horizontal)

        Gauge(value: currentValue) {
            Text("Foo")
        } currentValueLabel: {
            Text("42")
        } minimumValueLabel: {
            Text("0")
        } maximumValueLabel: {
            Text("100")
        }
    }
    .gaugeStyle(.accessoryCircular)
}
```

## ProgressView

### ProgressView
The different ProgressView initializers: indeterminate, value-based, total-based, timer-interval, and labeled forms. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
let workoutDateRange = Date()...Date().addingTimeInterval(5*60)

var body: some View {
    VStack {
        HStack(alignment: .top) {
            ProgressView()
            ProgressView("Foo")
        }
        HStack(alignment: .top) {
            ProgressView(value: 0.42)
                .padding(.top)
            ProgressView(value: 42, total: 100)
                .padding(.vertical)
        }
        ProgressView(timerInterval: workoutDateRange)
            .padding(.bottom)
        ProgressView(value: 0.42) {
            Text("Foo")
        } currentValueLabel: {
            Text("bar")
        }
    }
}
```

### ProgressView Colors
Customizing the colors of the ProgressView using tint and foreground style modifiers. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
VStack {
    ProgressView("Foo")
    ProgressView(value: 0.42) {
        Text("Foo")
    } currentValueLabel: {
        Text("bar")
    }
}
.tint(.red)
    .foregroundStyle(.brown)
```

### CircularProgressViewStyle
A progress view style that uses a circular gauge to indicate the partial completion of an activity. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, tvOS 14.0+, visionOS 1.0+)
```swift
VStack {
    ProgressView("Foo")
    ProgressView(value: 0.42) {
        Text("Foo")
    } currentValueLabel: {
        Text("bar")
    }
}
.progressViewStyle(.circular)
```

### LinearProgressViewStyle
A progress view that visually indicates its progress using a horizontal bar. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, visionOS 1.0+)
```swift
VStack {
    ProgressView("Foo")
    ProgressView(value: 0.42) {
        Text("Foo")
    } currentValueLabel: {
        Text("bar")
    }
}
.progressViewStyle(.linear)
```

## List

### Outline Group
Creates hierarchical, expandable lists from a tree-structured data model using OutlineGroup. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, visionOS 1.0+)
```swift
struct TreeItem: Identifiable {
  let id = UUID()
  let name: String
  let children: [TreeItem]?

  init(_ name: String, children: [TreeItem]? = nil) {
    self.name = name
    self.children = children
  }
}

let data = [
  TreeItem("Header", children: [
    TreeItem("Foo", children: [
      TreeItem("Foo 1"),
      TreeItem("Foo 2")
    ]),
    TreeItem("Bar", children: [
      TreeItem("Bar 1"),
      TreeItem("Bar 2")
    ])
  ])
]

var body: some View {
  List {
    OutlineGroup(data, children: \.children) { item in
      Text(item.name)
    }
  }
}
```

### Disclosure Group
A view that shows or hides another content view, based on the state of a disclosure control. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, visionOS 1.0+)
```swift
List {
  DisclosureGroup("Header") {
    Text("Foo")
    Text("Bar")
  }
}
```

### Edit Button
A button that toggles the edit mode environment value for a list with delete and move actions. (iOS 13.0+, iPadOS 13.0+, visionOS 1.0+)
```swift
@State var items = ["Foo", "Bar"]

var body: some View {
  NavigationView {
    List {
      ForEach(items, id: \.self) { item in
        Text(item)
      }
      .onDelete { _ in action() }
      .onMove { _, _ in action() }
    }
    .toolbar {
      EditButton()
    }
  }
}
```

### SidebarListStyle
The list style that describes the behavior and appearance of a sidebar list. (iOS 14.0+, iPadOS 14.0+, macOS 10.15+, visionOS 1.0+)
```swift
List {
  Section {
    Toggle("Toggle", isOn: .constant(true))
    TextField("TextField", text: .constant(""))
    Button("Button", action: action)
    Picker("Picker", selection: .constant(0)) {
      Text("Option 1").tag(0)
    }
  }

  Text("Foo")

  Section {
    Text("Bar1")
    Text("Bar2")
  } header: {
    Text("Header")
  } footer: {
    Text("Footer")
  }
}
.listStyle(.sidebar)
```

### InsetGroupedListStyle
The list style that describes the behavior and appearance of an inset grouped list. (iOS 14.0+, iPadOS 14.0+, visionOS 1.0+)
```swift
List {
  Section {
    Toggle("Toggle", isOn: .constant(true))
    TextField("TextField", text: .constant(""))
    Button("Button", action: action)
    Picker("Picker", selection: .constant(0)) {
      Text("Option 1").tag(0)
    }
  }

  Text("Foo")

  Section {
    Text("Bar1")
    Text("Bar2")
  } header: {
    Text("Header")
  } footer: {
    Text("Footer")
  }
}
.listStyle(.insetGrouped)
```

### InsetListStyle
The list style that describes the behavior and appearance of an inset list. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, visionOS 1.0+)
```swift
List {
  Section {
    Toggle("Toggle", isOn: .constant(true))
    TextField("TextField", text: .constant(""))
    Button("Button", action: action)
    Picker("Picker", selection: .constant(0)) {
      Text("Option 1").tag(0)
    }
  }

  Text("Foo")

  Section {
    Text("Bar1")
    Text("Bar2")
  } header: {
    Text("Header")
  } footer: {
    Text("Footer")
  }
}
.listStyle(.inset)
```

### EllipticalListStyle
The list style that defines the behavior and appearance of an elliptical list on watchOS. (watchOS 7.0+)
```swift
List {
  // sections and rows...
}
.listStyle(.elliptical)
```

### CarouselListStyle
The carousel list style, a specialized list presentation available on watchOS. (watchOS 6.0+)
```swift
List {
  // sections and rows...
}
.listStyle(.carousel)
```

### BorderedListStyle
The list style that describes the behavior and appearance of a list with standard border. (macOS 12.0+)
```swift
List {
  // sections and rows...
}
.listStyle(.bordered)
```

### Section Index Label and Visibility
Sets the label used in a section index to point to a section (typically a single character) and controls section index visibility. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
let items = ["Foo", "Bar"]

var body: some View {
  List(items, id: \.self) { item in
    Section(item) {
      ForEach(0 ..< 42) { number in
        Text(String(describing: number))
      }
    }
    .sectionIndexLabel(item)
  }
  .listSectionIndexVisibility(.visible)
}
```

### Move Disabled
Adds a condition for whether the view's view hierarchy is movable in an editable list. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
@State var items = ["Foo", "Bar"]

var body: some View {
  List($items, id: \.self, editActions: .move) { $item in
    Text(item)
      .moveDisabled(item == "Foo")
  }
  .environment(\.editMode, .constant(.active))
}
```

### Delete Disabled
Conditionally disables deletion for specific items in a List's edit mode. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
let items = ["Foo", "Bar"]

var body: some View {
  List {
    Section("Header") {
      ForEach(items, id: \.self) { item in
        Text(item)
          .deleteDisabled(item == "Foo")
      }.onDelete { _ in
        action()
      }
    }
  }
  .environment(\.editMode, .constant(.active))
}
```

### Refreshable List
Marks a List as refreshable using the .refreshable() modifier with a custom action handler. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
    Text("Bar")
  }
}
.refreshable(action: action)
```

### Swipe Action
Adds custom swipe actions to a row in a list. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
      .swipeActions(edge: .leading, allowsFullSwipe: false) {
        Button("Action", systemImage: "bolt", action: action)
          .tint(.accentColor)
      }
    Text("Bar")
  }
}
```

### List Badge Prominence
Controls the visual prominence of badges in list rows using the badgeProminence modifier. (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Increased")
      .badge("1")
      .badgeProminence(.increased)
    Text("Standard")
      .badge(2)
      .badgeProminence(.standard)
    Text("Decreased")
      .badge(3)
      .badgeProminence(.decreased)
  }
}
```

### List Badge
Attaches a badge displaying a string or integer value to items within a List. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
      .badge("1")
    Text("Bar")
      .badge(2)
  }
}
```

### List Row Background
Places a custom background view behind a list row item. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
      .listRowBackground(Color.accentColor)
    Text("Bar")
  }
}
```

### Hidden List Row Separator
Sets the display mode to hidden for the separator associated with a specific row. (iOS 15.0+, iPadOS 15.0+, macOS 13.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
    Text("Bar")
      .listRowSeparator(.hidden)
  }
}
```

### Hidden List Section Separator
Sets whether to hide the separator associated with a list section. (iOS 15.0+, iPadOS 15.0+, macOS 13.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
  }
  .listSectionSeparator(.hidden)

  Section("Header") {
    Text("Bar")
  }
}
.listStyle(.grouped)
```

### List Section Separator Tint
Sets the tint color associated with a section separator in a List. (iOS 15.0+, iPadOS 15.0+, macOS 13.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
  }
  .listSectionSeparatorTint(.accentColor)

  Section("Header") {
    Text("Bar")
  }
}
.listStyle(.grouped)
```

### List Row Separator Tint
Sets the tint color associated with a list row separator. (iOS 15.0+, iPadOS 15.0+, macOS 13.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
    Text("Bar")
      .listRowSeparatorTint(.primary)
  }
}
```

### List Item Tint
Sets a fixed tint color for content in a list. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
    Button("Bar", action: action)
    Label("FooBar", systemImage: "trash")
  }
  .listItemTint(.green)
}
```

### List Section Margins
Sets the section margins for specific edges using the listSectionMargins modifier. (iOS 26.0+, iPadOS 26.0+, visionOS 26.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
  }
  .listSectionMargins(.horizontal, 0)

  Section {
    Text("Bar")
  } header: {
    Text("Header")
  }
}
```

### Compact List Section Spacing
Applies compact spacing between sections in a List. (iOS 17.0+, iPadOS 17.0+, watchOS 10.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
  }
  Section("Header") {
    Text("Bar")
  }

  Section("Header") {
    Text("Foo")
  }
}
.listSectionSpacing(.compact)
```

### Custom List Section Spacing
Adjusts the spacing between adjacent sections in a List using a custom point value. (iOS 17.0+, iPadOS 17.0+, watchOS 10.0+, visionOS 1.0+)
```swift
List {
  Section("Header") {
    Text("Foo")
  }
  Section("Header") {
    Text("Bar")
  }
  .listSectionSpacing(42)
  Section("Header") {
    Text("Foo")
  }
}
```

### List Row Spacing
Sets the vertical spacing between adjacent rows in a List. (iOS 15.0+, iPadOS 15.0+, visionOS 1.0+)
```swift
List {
  Section {
    Text("Foo")
    Text("Bar")
  }
  Text("FooBar")
  Text("FooBar")
}
.listRowSpacing(5)
```

### Default Min List Header Height
Sets a custom minimum height for list section headers via the defaultMinListHeaderHeight environment value. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
List {
  Section {
    Text("Foo")
    Text("Bar")
  } header: {
    Text("Header")
  } footer: {
    Text("Footer")
  }
}
.environment(\.defaultMinListHeaderHeight, 100)
```

### Default Min List Row Height
Sets the minimum height of rows in a List via the defaultMinListRowHeight environment value. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
List {
  Section {
    Text("Foo")
    Text("Bar")
  } header: {
    Text("Header")
  } footer: {
    Text("Footer")
  }
}
.environment(\.defaultMinListRowHeight, 100)
```

### List Row Insets
Applies insets to rows (or individual row views) within a List using the listRowInsets modifier. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
List {
  Section {
    Text("All")
  } header: {
    Text("Header")
  }
  .listRowInsets(.all, 0)
  Section {
    Text("Header Only")
  } header: {
    Text("Header")
      .listRowInsets(.all, 0)
  }
  Section {
    Text("Normal")
  } header: {
    Text("Header")
  }
}
```

### Increased Header Prominence
Sets the header prominence to increased for a list's section headers. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
List {
  Section {
    Text("Foo")
  } header: {
    Text("Header")
  } footer: {
    Text("Footer")
  }
}
.headerProminence(.increased)
```

### List Background Prominence
Uses the backgroundProminence environment value to style row content differently when the list background has increased prominence (e.g. selection). (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, watchOS 10.0+, tvOS 17.0+, visionOS 1.0+)
```swift
@State var selectedEntry: String? = "Foo"
let entries = ["Foo", "Bar"]

private struct EntryItem: View {
  let text: String

  var body: some View {
    VStack(alignment: .leading) {
      HStack {
        EntryItemChild(text: text)
      }
    }
  }
}

private struct EntryItemChild: View {
  let text: String

  @Environment(\.backgroundProminence) private var backgroundProminence

  var body: some View {
    if backgroundProminence == .increased {
      Text(text)
        .bold()
        .italic()
    } else {
      Text(text)
        .foregroundStyle(Color.accentColor)
    }
  }
}

var body: some View {
  VStack {
    List(entries, id: \.self, selection: $selectedEntry) { entry in
      EntryItem(text: entry)
    }
  }
}
```

## TabView

### TabView
Creates Tabs with title, image, systemImage and custom Label. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 2.0+)
```swift
TabView {
    Tab {
        Text("0")
    }

    Tab("1", systemImage: "1.circle") {
        Text("1")
    }

    Tab("2", image: "cats24x24") {
        Text("2")
    }

    Tab {
        Text("3")
    } label: {
        Label("3", systemImage: "3.circle")
    }
}
```

### TabSection
A container that you can use to add hierarchy within a tab view. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 2.0+)
```swift
TabView {
    Tab {
        Text("0")
    }

    TabSection("Foo") {
        Tab("1", systemImage: "1.circle") {
            Text("1")
        }
    }

    Tab("2", image: "cats24x24") {
        Text("2")
    }

    Tab {
        Text("3")
    } label: {
        Label("3", systemImage: "3.circle")
    }
}
.tabViewStyle(.sidebarAdaptable)
```

### TabBarOnlyTabViewStyle
A tab view style that displays a tab bar when possible. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, tvOS 18.0+, visionOS 2.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.tabBarOnly)
```

### Search Tab Role
A tab with the search role; on Liquid Glass this tab is placed in its own group, appearing on the right side in left-to-right layouts. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 2.0+)
```swift
TabView {
    Tab {
        EmptyView()
    }
    Tab("1", systemImage: "1.circle", role: .search) {
        EmptyView()
    }

    Tab("2", image: "cats24x24") {
        EmptyView()
    }
    Tab {
        EmptyView()
    } label: {
        Label("3", systemImage: "3.circle")
    }
}
```

### GroupedTabViewStyle
A tab view style that displays a tab bar that groups its tabs together. (macOS 15.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.grouped)
```

### PageTabViewStyle
A TabViewStyle that displays a paged scrolling TabView. (iOS 14.0+, iPadOS 14.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.page)
```

### VerticalPageTabViewStyle
A TabViewStyle that displays a vertical TabView interaction and appearance. (watchOS 10.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.verticalPage)
```

### SidebarAdaptableTabViewStyle
A tab bar style that adapts to each platform. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, tvOS 18.0+, visionOS 2.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.sidebarAdaptable)
```

### TabView Bottom Accessory Placement
Adjusts tab view bottom accessory content based on whether it is displayed inline, expanded, or hidden. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
var body: some View {
    TabView {
        Tab("1", systemImage: "1.circle") {
            List {
                ForEach(0 ..< 100, id: \.self) {
                    Text("Item \($0)")
                }
            }
        }

        Tab("2", systemImage: "2.circle") {
            EmptyView()
        }

        Tab("3", systemImage: "3.circle") {
            EmptyView()
        }
    }
    .tabBarMinimizeBehavior(.onScrollDown)
    .tabViewBottomAccessory {
        AccessoryContent()
    }
}

struct AccessoryContent: View {
    @Environment(\.tabViewBottomAccessoryPlacement) var placement

    var body: some View {
        switch placement {
        case .inline:
            Text("Inline")
        case .expanded:
            Text("Expanded")
        case .none:
            Text("")
        }
    }
}
```

### Tab View Customization Behavior
Configures which tab view elements can be customized by users. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, visionOS 2.0+)
```swift
@AppStorage("tabCustomization") private var customization: TabViewCustomization

var body: some View {
    TabView {
        Tab {
            Text("0")
        }
        .customizationID("com.myApp.0")

        Tab("1", systemImage: "1.circle") {
            Text("1")
        }
        .customizationID("com.myApp.1")
        .customizationBehavior(.disabled, for: .sidebar, .tabBar)

        Tab("2", image: "cats24x24") {
            Text("2")
        }
        .customizationID("com.myApp.2")

        Tab {
            Text("3")
        } label: {
            Label("3", systemImage: "3.circle")
        }
        .customizationID("com.myApp.3")
    }
    .tabViewStyle(.sidebarAdaptable)
    .tabViewCustomization($customization)
}
```

### Tab View Customization
Applies user customizations to the sidebar representation of a tab view, persisted via AppStorage. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, visionOS 2.0+)
```swift
@AppStorage("tabCustomization") private var customization: TabViewCustomization

var body: some View {
    TabView {
        Tab {
            Text("0")
        }
        .customizationID("com.myApp.0")

        Tab("1", systemImage: "1.circle") {
            Text("1")
        }
        .customizationID("com.myApp.1")

        Tab("2", image: "cats24x24") {
            Text("2")
        }
        .customizationID("com.myApp.2")

        Tab {
            Text("3")
        } label: {
            Label("3", systemImage: "3.circle")
        }
        .customizationID("com.myApp.3")
    }
    .tabViewStyle(.sidebarAdaptable)
    .tabViewCustomization($customization)
}
```

### Tab View Side Bar Footer
Adds a custom footer to the sidebar of a tab view. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, visionOS 2.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.sidebarAdaptable)
.tabViewSidebarFooter {
    Label("Foo", systemImage: "star")
}
```

### Tab View Side Bar Bottom Bar
Adds a custom bottom bar to the sidebar of a tab view. (iOS 18.0+, iPadOS 18.0+, visionOS 2.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.sidebarAdaptable)
.tabViewSidebarBottomBar {
    Label("Foo", systemImage: "star")
}
```

### Default Adaptable Tab Bar Placement
Specifies the default placement for tabs in a tab view using the adaptable sidebar style. (iOS 18.0+, iPadOS 18.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.sidebarAdaptable)
.defaultAdaptableTabBarPlacement(.tabBar)
```

### Tab Bar Section Actions
Adds custom actions to a tab section using the `.sectionActions` modifier. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, tvOS 18.0+, visionOS 2.0+)
```swift
TabView {
    Tab {
        Text("0")
    }

    TabSection("Foo") {
        Tab("1", systemImage: "1.circle") {
            Text("1")
        }
    }
    .sectionActions {
        Button("Bar", systemImage: "plus", action: action)
    }

    Tab("2", image: "cats24x24") {
        Text("2")
    }
}
.tabViewStyle(.sidebarAdaptable)
```

### Tab View Side Bar Header
Adds a custom header to the sidebar of a tab view. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, visionOS 2.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.sidebarAdaptable)
.tabViewSidebarHeader {
    Label("Foo", systemImage: "star")
}
```

### Tab Badge
Generates a badge for a tab from an integer value. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, visionOS 2.0+)
```swift
TabView {
    Group {
        Tab {
            Text("0")
        }

        Tab("1", systemImage: "1.circle") {
            Text("1")
        }

        Tab("2", image: "cats24x24") {
            Text("2")
        }

        Tab {
            Text("3")
        } label: {
            Label("3", systemImage: "3.circle")
        }
    }
}.badge(42)
```

### Hidden Index PageTabViewStyle
A TabViewStyle that displays a paged scrolling TabView with a hidden index. (iOS 14.0+, iPadOS 14.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        Text("1")
    }
    // more tabs...
}
.tabViewStyle(.page(indexDisplayMode: .never))
```

### Value Tab View
Creates a tab view that uses a builder to create and specify selection values for its tabs. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 2.0+)
```swift
@State var selection = "1"

var body: some View {
    let displayedSelection = Text("Selected: \(selection)")

    TabView(selection: $selection) {
        Tab(value: "0") {
            displayedSelection
        }
        Tab("1", systemImage: "1.circle", value: "1") {
            displayedSelection
        }

        Tab("2", image: "cats24x24", value: "2") {
            displayedSelection
        }
        Tab(value: "3") {
            displayedSelection
        } label: {
            Label("3", systemImage: "3.circle")
        }
    }
}
```

### Hide Tab Bar On Scroll Down
Minimizes a tab bar when the user scrolls downward in a TabView. (iOS 26.0+, iPadOS 26.0+)
```swift
TabView {
    Tab("1", systemImage: "1.circle") {
        List {
            ForEach(0 ..< 100, id: \.self) {
                Text("Item \($0)")
            }
        }
    }

    Tab("2", systemImage: "2.circle") {
        EmptyView()
    }

    Tab("3", systemImage: "3.circle") {
        EmptyView()
    }
}
.tabBarMinimizeBehavior(.onScrollDown)
```

### Bottom Accessory
A modifier to place content above the tabs. (iOS 26.0+, iPadOS 26.0+)
```swift
TabView {
  Tab("1", systemImage: "1.circle") {
    EmptyView()
  }

  Tab("2", systemImage: "2.circle") {
    EmptyView()
  }

  Tab("3", systemImage: "3.circle") {
    EmptyView()
  }
}
.tabViewBottomAccessory {
  Text("Foo")
}
```

## ViewThatFits

### ViewThatFits
A view that adapts to the available space by providing the first child view that fits. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
var body: some View {
  VStack(alignment: .leading) {
    testContent
      .background(.red)
      .frame(maxWidth: 300)
    testContent
      .background(.red.secondary)
      .frame(maxWidth: 200)
    testContent
      .background(.red.tertiary)
      .frame(maxWidth: 100)
    testContent
      .background(.red.quaternary)
      .frame(maxWidth: 50)
  }
}

@ViewBuilder
var testContent: some View {
  ViewThatFits {
    Text("Available width 300")
      .frame(width: 300, height: 20)
      .foregroundStyle(.white)
    Text("Available width 200")
      .frame(width: 200, height: 20)
      .foregroundStyle(.white)
    Text("A. w. 100")
      .frame(width: 100, height: 20)
      .foregroundStyle(.white)
    Text("Fallback")
      .frame(width: 80, height: 20)
      .foregroundStyle(.white)
  }
}
```

### ViewThatFits Vertical
A view that adapts to available vertical space by providing the first child view that fits. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
var body: some View {
  VStack(alignment: .leading) {
    testContent
      .background(.red)
      .frame(maxWidth: 200)
    testContent
      .background(.red.secondary)
      .frame(maxHeight: 20)
    testContent
      .background(.red.tertiary)
      .frame(maxHeight: 9)
  }
}

@ViewBuilder
var testContent: some View {
  ViewThatFits(in: .vertical) {
    Text("Size w300 h30")
      .frame(width: 300, height: 30)
      .foregroundStyle(.white)
    Text("Size w200 h20")
      .frame(width: 200, height: 20)
      .foregroundStyle(.white)
    Text("Fallback")
      .frame(width: 80, height: 10)
      .foregroundStyle(.white)
  }
}
```

## Sheet

### Boolean Sheet
Presents a sheet when a binding to a Boolean value that you provide is true. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
        }
}
```

### Item Sheet
Presents a sheet using the given item as a data source for the sheet's content. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
struct IdentifableItem: Identifiable {
    let id = UUID()
}

@State var item: IdentifableItem? = .init()

var body: some View {
    Text("Foo")
        .sheet(item: $item) { itm in
            sheetContent(itm)
        }
}
```

### Sheet Size
Sets the available detents for the enclosing sheet. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
                .presentationDetents([.medium, .height(200), .fraction(0.1)])
        }
}
```

### Sheet Drag Indicator Visibility
Sets the visibility of the drag indicator on top of a sheet. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
                .presentationDragIndicator(.visible)
        }
}
```

### Sheet Background
Sets the presentation background of the enclosing sheet using a shape style. (iOS 16.4+, iPadOS 16.4+, macOS 13.3+, watchOS 9.4+, tvOS 16.4+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
                .presentationBackground(.blue)
        }
}
```

### Sheet Background Interaction
Controls whether people can interact with the view behind a presentation. (iOS 16.4+, iPadOS 16.4+, macOS 13.3+, watchOS 9.4+, tvOS 16.4+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Button("You can still tap on me with the sheet open") {
        showSheet.toggle()
    }
    .padding(.bottom, 120)
    .sheet(isPresented: $showSheet) {
        sheetContent
            .presentationDetents([.medium])
            .presentationBackgroundInteraction(.enabled)
    }
}
```

### Prioritize Sheet Content Scrolling
Configures swipe gesture behavior on a sheet so scrolling the content takes priority over resizing the sheet. (iOS 16.4+, iPadOS 16.4+, macOS 13.3+, watchOS 9.4+, tvOS 16.4+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            ScrollView {
                ForEach(0 ..< 50) { i in
                    Text("Bar \(i)")
                }
            }
            .presentationDetents([.medium, .large])
            .presentationContentInteraction(.scrolls)
        }
}
```

### Sheet Corner Radius
Applies a specific corner radius to a sheet presentation via presentationCornerRadius. (iOS 16.4+, iPadOS 16.4+, macOS 13.3+, watchOS 9.4+, tvOS 16.4+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
                .presentationCornerRadius(84)
        }
}
```

### Fitted Sheet Sizing
Sets the sizing of the containing presentation with `.presentationSizing(.fitted)`; no effect on smaller devices like iPhone and Apple Watch. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
                .presentationSizing(.fitted)
        }
}
```

### Page Screen Sheet Size
Uses `.presentationSizing(.page)` so sheets fill the full height and width on iPhone/iPad while behaving like `.fitted` on macOS. (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 2.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
                .presentationSizing(.page)
        }
}
```

### Disable Sheet Dismiss Swipe
Uses `interactiveDismissDisabled()` to conditionally prevent interactive dismissal of presentations like sheets, popovers, and inspectors. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
@State var showSheet = true

var body: some View {
    Text("Foo")
        .sheet(isPresented: $showSheet) {
            sheetContent
                .interactiveDismissDisabled()
        }
}
```

## Menu

### Menu
A control for presenting a menu of actions. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, tvOS 17.0+, visionOS 1.0+)
```swift
Menu {
    Button("Button 1", action: action)
    Button("Button 2", systemImage: "button.vertical.left.press", action: action)
    Button(action: action) {
        Text("Button 3")
        Text("Description 3")
    }
} label: {
    Text("Buttons")
}
```

### Menu Action Button
A Menu whose label acts like a button via `primaryAction`, opening the menu on a secondary gesture. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, tvOS 17.0+, visionOS 1.0+)
```swift
Menu {
    Button("Button 1", action: action)
    Button("Button 2", systemImage: "button.vertical.left.press", action: action)
    Button(action: action) {
        Text("Button 3")
        Text("Description 3")
    }
} label: {
    Text("Button 0")
} primaryAction: {
    print("Button 0 tapped")
}
```

### Context Menu
Adds a context menu to a view. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, tvOS 14.0+, visionOS 1.0+)
```swift
Text("Buttons")
    .contextMenu {
        Button("Button 1", action: action)
        Button("Button 2", systemImage: "button.vertical.left.press", action: action)
        Button(action: action) {
            Text("Button 3")
            Text("Description 3")
        }
    }
```

### Context Menu Preview
A context menu with custom preview content shown alongside the menu items. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, tvOS 16.0+, visionOS 1.0+)
```swift
Text("Buttons")
    .contextMenu {
        Button("Button 1", action: action)
        Button("Button 2", systemImage: "button.vertical.left.press", action: action)
        Button(action: action) {
            Text("Button 3")
            Text("Description 3")
        }
    } preview: {
        Text("Custom Preview")
            .padding()
    }
```

### Menu Fixed Order
Orders menu items from top to bottom using the `.menuOrder(.fixed)` modifier. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
Menu {
    Button("Button 1", action: action)
    Button("Button 2", systemImage: "button.vertical.left.press", action: action)
    Button(action: action) {
        Text("Button 3")
        Text("Description 3")
    }
} label: {
    Text("Buttons")
}
.menuOrder(.fixed)
```

### Nested Menu
A Menu inside a Menu, creating a submenu. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, tvOS 17.0+, visionOS 1.0+)
```swift
Menu {
    Button("Button 1", action: action)
    Menu("Other") {
        Button("Button 2", systemImage: "button.vertical.left.press", action: action)
        Button(action: action) {
            Text("Button 3")
            Text("Description 3")
        }
    }
} label: {
    Text("Buttons")
}
```

### Menu Divider
A Menu with a Divider to visually separate menu items. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
Menu {
    Button("Button 1", action: action)
    Divider()
    Button("Button 2", systemImage: "button.vertical.left.press", action: action)
    Button(action: action) {
        Text("Button 3")
        Text("Description 3")
    }
} label: {
    Text("Buttons")
}
```

### Menu Section
A Section inside a Menu for grouping items under a header. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
Menu {
    Button("Button 1", action: action)
    Section("foo") {
        Button("Button 2", systemImage: "button.vertical.left.press", action: action)
        Button(action: action) {
            Text("Button 3")
            Text("Description 3")
        }
    }
} label: {
    Text("Buttons")
}
```

## GroupBox

### GroupBox
A simple GroupBox showing basic usage of the container. (iOS 14.0+, iPadOS 14.0+, macOS 10.15+, visionOS 1.0+)
```swift
GroupBox {
    Text(loremIpsum)
}
```

### GroupBox With Label
A GroupBox with a labeled header. (iOS 14.0+, iPadOS 14.0+, macOS 10.15+, visionOS 1.0+)
```swift
GroupBox {
    Text(loremIpsum)
} label: {
    Label("Hello World", systemImage: "globe")
}
```

### GroupBox Background
Sets a custom GroupBox background using the `backgroundStyle` modifier. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
GroupBox {
    Text(loremIpsum)
}
.backgroundStyle(.blue.tertiary)
```

## Divider

### Divider
A visual element that can be used to separate other content. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
Divider()
```

### Divider Height
Customizes the height (thickness) of a Divider using a frame and overlay. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
Divider()
  .frame(height: 5)
  .overlay(.brown)
```

### Divider Color
Customizes the color of a Divider using an overlay. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
Divider()
    .overlay(.blue)
```

### Vertical Divider
A Divider rendered vertically by placing it inside an HStack. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
HStack {
    Divider()
}
```

## Color

### Standard Colors
SwiftUI's built-in standard color palette applied via `foregroundStyle`: black, blue, brown, clear, cyan, gray, green, indigo, mint, orange, pink, purple, red, teal, white, yellow. (iOS 13.0+, iPadOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
smallRect
    .foregroundStyle(.blue)
smallRect
    .foregroundStyle(.indigo)
// ... .black, .brown, .clear, .cyan, .gray, .green, .mint,
//     .orange, .pink, .purple, .red, .teal, .white, .yellow
```

### Semantic Colors
SwiftUI semantic color styles `.primary` and `.secondary` for text. (iOS 13.0+, macOS 10.15+, watchOS 6.0+, tvOS 13.0+, visionOS 1.0+)
```swift
Text("Primary Text Color")
  .foregroundStyle(.primary)
Text("Secondary Text Color")
  .foregroundStyle(.secondary)
```

### Color Variants
HierarchicalShapeStyle — a shape style that maps to one of the numbered content styles (secondary through quinary) of a color. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
HStack {
  smallRect
    .foregroundStyle(.blue)
  smallRect
    .foregroundStyle(.blue.secondary)
  smallRect
    .foregroundStyle(.blue.tertiary)
  smallRect
    .foregroundStyle(.blue.quaternary)
  smallRect
    .foregroundStyle(.blue.quinary)
}
```

### Color Gradient
The `.gradient` variation of a color, combined with hierarchical variants and opacity. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
VStack {
  HStack {
    smallRect
      .foregroundStyle(.blue.gradient)
    smallRect
      .foregroundStyle(.blue.gradient.secondary)
    smallRect
      .foregroundStyle(.blue.gradient.tertiary)
    smallRect
      .foregroundStyle(.blue.gradient.quaternary)
    smallRect
      .foregroundStyle(.blue.gradient.quinary)
  }
  HStack {
    smallRect
      .foregroundStyle(.blue.gradient.opacity(0.9))
    smallRect
      .foregroundStyle(.blue.gradient.opacity(0.7))
    smallRect
      .foregroundStyle(.blue.gradient.tertiary.opacity(0.5))
    smallRect
      .foregroundStyle(.blue.gradient.quaternary.opacity(0.3))
    smallRect
      .foregroundStyle(.blue.gradient.quinary.opacity(0.1))
  }
}
```

### Color Opacity
Applying varying opacity levels to colors via the `.opacity` modifier on a color style. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
HStack {
  smallRect
    .foregroundStyle(.blue.opacity(1))
  smallRect
    .foregroundStyle(.blue.opacity(0.7))
  smallRect
    .foregroundStyle(.blue.opacity(0.5))
  smallRect
    .foregroundStyle(.blue.opacity(0.3))
  smallRect
    .foregroundStyle(.blue.opacity(0.1))
}
```

### UIKit Label Colors
UIKit's semantic label color hierarchy applied to SwiftUI Text via `foregroundStyle`. (iOS 13.0+, iPadOS 13.0+, tvOS 13.0+, visionOS 1.0+)
```swift
Text("Label")
  .foregroundStyle(Color(.label))
Text("Secondary Label")
  .foregroundStyle(Color(.secondaryLabel))
Text("Tertiary Label")
  .foregroundStyle(Color(.tertiaryLabel))
Text("Quaternary Label")
  .foregroundStyle(Color(.quaternaryLabel))
```

### UIKit Fill Colors
UIKit system fill colors applied to SwiftUI views. (iOS 13.0+, iPadOS 13.0+, visionOS 1.0+)
```swift
HStack {
  smallRect
    .foregroundStyle(Color(.systemFill))
  smallRect
    .foregroundStyle(Color(.secondarySystemFill))
  smallRect
    .foregroundStyle(Color(.tertiarySystemFill))
  smallRect
    .foregroundStyle(Color(.quaternarySystemFill))
}
```

### UIKit Text Colors
UIKit text colors, specifically the placeholder text color used by TextField. (iOS 13.0+, iPadOS 13.0+, tvOS 13.0+, visionOS 1.0+)
```swift
TextField("Placeholder", text: .constant(""))
Text("Placeholder")
  .foregroundStyle(Color(.placeholderText))
```

### UIKit Content Background Colors
UIKit system background colors used by components like List and GroupBox. (iOS 13.0+, iPadOS 13.0+, visionOS 1.0+)
```swift
HStack {
  smallRect
  // can also be used as inverted text color
    .foregroundStyle(Color(.systemBackground))
  smallRect
  // GroupBox content background
    .foregroundStyle(Color(.secondarySystemBackground))
  smallRect
    .foregroundStyle(Color(.tertiarySystemBackground))
  smallRect
  // List background
    .foregroundStyle(Color(.systemGroupedBackground))
  smallRect
  // List content background
    .foregroundStyle(Color(.secondarySystemGroupedBackground))
  smallRect
    .foregroundStyle(Color(.tertiarySystemGroupedBackground))
}
```

### UIKit Separator Colors
UIKit separator colors (`.separator`, `.opaqueSeparator`) in SwiftUI, matching the Divider color. (iOS 13.0+, iPadOS 13.0+, tvOS 13.0+, visionOS 1.0+)
```swift
HStack {
  smallRect
  // Divider color
    .foregroundStyle(Color(.separator))
  smallRect
    .foregroundStyle(Color(.opaqueSeparator))
}
```

## Text

### Text Format
Creates a text view that displays the formatted representation of a nonstring type using a corresponding format style (currency, percent, measurements, dates, durations). (iOS 18.0+, iPadOS 18.0+, macOS 15.0+, watchOS 11.0+, tvOS 18.0+, visionOS 2.0+)
```swift
VStack {
  HStack {
    Text(1234.56, format: .currency(code: Locale.current.currency?.identifier ?? "USD"))
    Text(0.874, format: .percent)
    Text(3.14159, format: .number.precision(.fractionLength(2)))
    Text(9876543, format: .number.grouping(.automatic))
    Text(6.022e23, format: .number.notation(.scientific))
  }
  HStack {
    Text(Measurement(value: 123.45, unit: UnitLength.meters), format: .measurement(width: .wide))
    Text(Measurement(value: 70.0, unit: UnitMass.kilograms), format: .measurement(width: .narrow))
    Text(Measurement(value: 25.5, unit: UnitTemperature.celsius), format: .measurement(width: .abbreviated))
    Text(Measurement(value: -30.1, unit: UnitTemperature.celsius), format: .measurement(width: .wide))
  }
  HStack {
    Text(Date(), format: .dateTime.hour().minute().second())
    Text(Date(), format: .dateTime.day().month().year())

    Text(Duration.seconds(3800), format: .time(pattern: .hourMinute))
    Text(Duration.seconds(91), format: .time(pattern: .minuteSecond))
  }
}
```

## Material

### Materials
The five material thickness levels (ultraThin, thin, regular, thick, ultraThick) over gradient and image backgrounds. (iOS 15.0+, iPadOS 15.0+, macOS 12.0+, watchOS 8.0+, tvOS 15.0+, visionOS 1.0+)
```swift
HStack {
  smallRect
    .foregroundStyle(.ultraThinMaterial)
  smallRect
    .foregroundStyle(.thinMaterial)
  smallRect
    .foregroundStyle(.regularMaterial)
  smallRect
    .foregroundStyle(.thickMaterial)
  smallRect
    .foregroundStyle(.ultraThickMaterial)
}
.padding()
.background {
  Image(.cats)
    .resizable()
    .aspectRatio(contentMode: .fill)
    .clipped()
}
```

## Label

### System Image Label
Creates a label combining a system icon image with a title from a localized string. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
Label("Foo", systemImage: "water.waves")
```

### Image Label
Creates a label with an icon image and a title generated from a localized string. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
Label("Foo", image: .cats)
```

### Custom Label
Creates a label with a custom title and icon using view-builder closures. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
Label {
    Text("Foo")
    Text("Bar")
} icon: {
    Image(systemName: "1.circle")
    Image(systemName: "2.circle")
}
```

### Label Styles
The built-in label style variants: title-and-icon, title-only, and icon-only. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
VStack {
    Label("Foo", systemImage: "water.waves")
        .labelStyle(.titleAndIcon)
    Label("Foo", systemImage: "water.waves")
        .labelStyle(.titleOnly)
    Label("Foo", systemImage: "water.waves")
        .labelStyle(.iconOnly)
}
```

## LabeledContent

### Labeled Content
Creates a basic labeled informational view pairing a label with a value. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
List {
    LabeledContent("Foo", value: "Bar")
}
```

### Formatted Labeled Content
Creates a labeled informational view that displays a formatted value (e.g. currency). (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
List {
    LabeledContent("Amount", value: 42, format: .currency(code: "EUR"))
}
```

### Custom Labeled Content
Creates a standard labeled element with a custom value view and multi-part label. (iOS 16.0+, iPadOS 16.0+, macOS 13.0+, watchOS 9.0+, tvOS 16.0+, visionOS 1.0+)
```swift
List {
    LabeledContent {
        Button("bar", action: action)
    } label: {
        Label("Foo", systemImage: "star")
        Text("Sub")
    }
}
```

## ContentUnavailableView

### ContentUnavailableView
A placeholder for empty results with an optional actions button. (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, watchOS 10.0+, tvOS 17.0+, visionOS 1.0+)
```swift
ContentUnavailableView {
    Label("No Mail", systemImage: "tray.fill")
} description: {
    Text("New mails you receive will appear here.")
} actions: {
    Button("Switch Account") { }
        .buttonStyle(.borderedProminent)
}
```

### Content Unavailable Search
A pre-built placeholder for empty search result states. (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, watchOS 10.0+, tvOS 17.0+, visionOS 1.0+)
```swift
ContentUnavailableView.search
```

### Content Unavailable Search Text
A pre-built placeholder for empty search results that echoes the search text. (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, watchOS 10.0+, tvOS 17.0+, visionOS 1.0+)
```swift
ContentUnavailableView.search(text: "foo")
```

## View Modifiers

### Glass Effect
Applies the Liquid Glass effect to a view, with shape, interactive, and tint variants. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+)
```swift
HStack {
  Text("Foo")
    .padding()
    .glassEffect()
  Text("Foo")
    .padding()
    .glassEffect(in: .rect(cornerRadius: 10))
  Text("Foo")
    .padding()
    .glassEffect(.regular.interactive())
  Text("Foo")
    .padding()
    .glassEffect(.regular.tint(.red))
}
```

### Background Extension Effect
Duplicates a view into mirrored, blurred copies placed around it on edges with available safe area. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
Image(.cats)
    .resizable()
    .aspectRatio(contentMode: .fill)
    .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
    .backgroundExtensionEffect()
```

### ControlSize
The different `controlSize` variants (mini through extraLarge) applied to buttons. (iOS 15.0+, iPadOS 15.0+, macOS 10.15+, watchOS 9.0+, tvOS 15.0+, visionOS 1.0+)
```swift
VStack {
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .controlSize(.mini)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .controlSize(.regular)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    Button("Tap Me", action: action)
        .buttonStyle(.borderedProminent)
    // only on visionOS bigger than large
        .controlSize(.extraLarge)
}
```

### Navigation Container Background
Sets the container background of an enclosing navigation container with a style such as a gradient. (iOS 17.0+, iPadOS 17.0+, macOS 14.0+, tvOS 17.0+, visionOS 1.0+)
```swift
NavigationStack {
    Text("Foo")
        .containerBackground(.blue.gradient, for: .navigation)
}
```

### Navigation Split View Container Background
Applies background placements behind NavigationSplitView columns using `containerBackground`. (iOS 18.0+, iPadOS 18.0+, watchOS 11.0+)
```swift
NavigationSplitView {
    Text("Foo")
        .containerBackground(.thinMaterial, for: .navigation)
        .containerBackground(.blue.gradient, for: .navigationSplitView)
} detail: {
    Text("Bar")
        .containerBackground(.ultraThinMaterial, for: .navigation)
}
```

## GlassEffectContainer

### Glass Effect Container
A view that combines multiple Liquid Glass shapes into a single shape that can morph individual shapes into one another. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+)
```swift
GlassEffectContainer(spacing: 40.0) {
  HStack(spacing: 40.0) {
    Image(systemName: "1.circle")
      .frame(width: 80.0, height: 80.0)
      .font(.system(size: 36))
      .glassEffect()
      .offset(x: 30.0, y: 0.0)

    Image(systemName: "2.circle")
      .frame(width: 80.0, height: 80.0)
      .font(.system(size: 36))
      .glassEffect()
      .offset(x: -30.0, y: 0.0)
  }
}
```

## Shapes

### ContainerRelativeShape
A shape that adapts to match the current container's shape, defaulting to a rectangle when no container shape is defined. (iOS 14.0+, iPadOS 14.0+, macOS 11.0+, watchOS 7.0+, tvOS 14.0+, visionOS 1.0+)
```swift
VStack {
    Text("Foo")
    VStack {
        Text("Bar")
        Text("Foo")
            .padding()
            .background(ContainerRelativeShape().fill(Color.green))
    }
    .padding()
        .background(ContainerRelativeShape().fill(Color.red))
}
.padding()
    .background(.blue, in: RoundedRectangle(cornerRadius: 40))
```

## ConcentricRectangle

### Concentric Rectangle
A rectangle whose corner radii are derived concentrically from its parent container's corners. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
ZStack(alignment: .bottom) {
    // Respects radius from device frame
    ConcentricRectangle()
        .fill(Color.blue)
        .frame(height: 50)
        .frame(maxHeight: .infinity, alignment: .bottom)
        .padding(30)
        .ignoresSafeArea()

    ZStack {
        // Gets radius from parent rect
        ConcentricRectangle()
            .fill(.secondary)

        // Respects radius from parent rect
        ConcentricRectangle()
            .fill(.red)
            .frame(width: 200, height: 200)
            .padding([.trailing, .bottom])
    }
    .containerShape(
        .rect(cornerRadius: 42)
    )
    .frame(width: 250, height: 250)
    .padding(.bottom)
}
```

### Uniform Concentric Rectangle
Creates a concentric rectangle with identical corner styling applied uniformly across all four corners. (iOS 26.0+, iPadOS 26.0+, macOS 26.0+, watchOS 26.0+, tvOS 26.0+, visionOS 26.0+)
```swift
ConcentricRectangle(corners: .concentric, isUniform: true)
    .fill(Color.blue)
    .frame(height: 50)
    .frame(maxHeight: .infinity, alignment: .bottom)
    .padding(30)
    .ignoresSafeArea()
```

---

## What's New by WWDC

### WWDC25 (iOS 26 / Liquid Glass era)
- **Button**: `buttonSizing` modifier, role buttons with default labels, glass button styles (`.glass`, `.glassProminent`)
- **Toolbars**: title toolbar item placements (`.largeTitle`, `.title`, `.subtitle`, `.largeSubtitle`), `sharedBackgroundVisibility`, `ToolbarSpacer`
- **Slider**: `SliderTick` / `SliderTickContentForEach` custom tick initializers
- **List**: `sectionIndexLabel` / `listSectionIndexVisibility`, `listSectionMargins`
- **ScrollView**: hard `scrollEdgeEffectStyle`
- **Navigation**: `navigationSubtitle` (on iOS)
- **View**: `backgroundExtensionEffect`, `glassEffect`
- **TabView**: `tabViewBottomAccessory` + placement environment, `tabBarMinimizeBehavior(.onScrollDown)`
- **GlassEffectContainer**: morphing container for Liquid Glass shapes
- **ConcentricRectangle**: standard and uniform initializers

### WWDC26 (iOS 27)
- **AsyncImage**: URL-request-based initializers (`AsyncImage(request:)`), `asyncImageURLSession` custom session, custom placeholder and phases variants
- **Alert**: `alert(error:)` error alerts (with and without message), `alert(_:item:)` item alerts (with and without message)

