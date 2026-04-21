'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.HeaderControls = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  function getAxisLabel(axis) {
    if (axis === 'row' || axis === 'column') {
      return axis;
    }

    return 'item';
  }

  function getContextActions(axis, index) {
    if (axis === 'row') {
      return [
        {
          action: 'insert-before',
          axis,
          index,
          kind: 'insert-rows',
          label: 'Insert row above',
          shortcut: 'Shift+Enter',
        },
        {
          action: 'insert-after',
          axis,
          index,
          kind: 'insert-rows',
          label: 'Insert row below',
          shortcut: 'Enter',
        },
        {
          action: 'delete',
          axis,
          index,
          kind: 'delete-rows',
          label: 'Delete row',
          shortcut: 'Delete',
        },
      ];
    }

    if (axis === 'column') {
      return [
        {
          action: 'insert-before',
          axis,
          index,
          kind: 'insert-columns',
          label: 'Insert column left',
          shortcut: 'Shift+Enter',
        },
        {
          action: 'insert-after',
          axis,
          index,
          kind: 'insert-columns',
          label: 'Insert column right',
          shortcut: 'Enter',
        },
        {
          action: 'delete',
          axis,
          index,
          kind: 'delete-columns',
          label: 'Delete column',
          shortcut: 'Delete',
        },
      ];
    }

    return [];
  }

  function buildOperation(action) {
    if (!action) {
      return null;
    }

    if (action.action === 'insert-after') {
      return {
        kind: action.kind,
        index: action.index + 1,
        count: 1,
      };
    }

    return {
      kind: action.kind,
      index: action.index,
      count: 1,
    };
  }

  function attachHeaderControls(options) {
    const root = options && options.root;
    const menu = options && options.menu;
    const actionList = options && options.actionList;
    const onAction = options && options.onAction;

    if (!root || !menu || !actionList) {
      return { destroy() {} };
    }

    let currentContext = null;

    function hideMenu() {
      currentContext = null;
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
      menu.removeAttribute('data-axis');
      menu.removeAttribute('data-index');
      actionList.innerHTML = '';
    }

    function showMenu(trigger, axis, index) {
      currentContext = { axis, index, trigger };
      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      menu.dataset.axis = axis;
      menu.dataset.index = String(index);
      actionList.innerHTML = '';

      const actions = getContextActions(axis, index);
      for (const action of actions) {
        const button = document.createElement('button');
        button.className = 'sheet-context-menu__item';
        if (action.action === 'delete') {
          button.classList.add('sheet-context-menu__item--danger');
        }
        button.type = 'button';
        button.dataset.structuralAction = action.action;
        button.innerHTML = '<span>' + action.label + '</span><span class="sheet-context-menu__shortcut">' + action.shortcut + '</span>';
        actionList.appendChild(button);
      }

      const rect = trigger.getBoundingClientRect();
      const left = Math.min(window.innerWidth - menu.offsetWidth - 12, Math.max(12, rect.left));
      const top = Math.min(window.innerHeight - menu.offsetHeight - 12, rect.bottom + 8);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    }

    function findHeaderTrigger(target) {
      if (!target || !target.closest) {
        return null;
      }

      return target.closest('[data-header-axis][data-header-index]');
    }

    function openFromEvent(event) {
      const trigger = findHeaderTrigger(event.target);
      if (!trigger) {
        return false;
      }

      event.preventDefault();
      showMenu(trigger, trigger.dataset.headerAxis, Number(trigger.dataset.headerIndex));
      return true;
    }

    function onRootClick(event) {
      if (event.target.closest('[data-header-affordance]')) {
        openFromEvent(event);
        return;
      }

      if (!event.target.closest('[data-sheet-context-menu]')) {
        hideMenu();
      }
    }

    function onRootContextMenu(event) {
      if (!openFromEvent(event) && !event.target.closest('[data-sheet-context-menu]')) {
        hideMenu();
      }
    }

    function onMenuClick(event) {
      const button = event.target.closest('[data-structural-action]');
      if (!button || !currentContext) {
        return;
      }

      const action = getContextActions(currentContext.axis, currentContext.index).find(function (item) {
        return item.action === button.dataset.structuralAction;
      });

      if (action && typeof onAction === 'function') {
        onAction(buildOperation(action), action, currentContext);
      }

      hideMenu();
    }

    function onDocumentKeydown(event) {
      if (event.key === 'Escape') {
        hideMenu();
      }
    }

    root.addEventListener('click', onRootClick);
    root.addEventListener('contextmenu', onRootContextMenu);
    menu.addEventListener('click', onMenuClick);
    document.addEventListener('keydown', onDocumentKeydown);

    return {
      destroy() {
        root.removeEventListener('click', onRootClick);
        root.removeEventListener('contextmenu', onRootContextMenu);
        menu.removeEventListener('click', onMenuClick);
        document.removeEventListener('keydown', onDocumentKeydown);
      },
      hideMenu,
    };
  }

  return {
    attachHeaderControls,
    getAxisLabel,
    getContextActions,
  };
});
