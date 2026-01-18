class EventEmitter {
  constructor() {
    this.listeners = [];
    this.event = (listener) => {
      this.listeners.push(listener);
      return { dispose: () => this.remove(listener) };
    };
  }

  fire(data) {
    for (const listener of this.listeners.slice()) {
      listener(data);
    }
  }

  dispose() {
    this.listeners = [];
  }

  remove(listener) {
    this.listeners = this.listeners.filter((item) => item !== listener);
  }
}

class ThemeIcon {
  constructor(id) {
    this.id = id;
  }
}

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.contextValue = undefined;
    this.description = undefined;
    this.iconPath = undefined;
    this.command = undefined;
    this.tooltip = undefined;
    this.resourceUri = undefined;
  }
}

const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2
};

module.exports = { EventEmitter, ThemeIcon, TreeItem, TreeItemCollapsibleState };
