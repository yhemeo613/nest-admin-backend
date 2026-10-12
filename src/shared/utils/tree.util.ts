export interface TreeNodeLike {
  id: string;
  parentId: string | null;
  sort?: number;
}

export type TreeNode<T extends TreeNodeLike> = T & { children: TreeNode<T>[] };

/** 扁平列表转树（按 sort 升序），parentId 为 null 或指向不存在节点时作为根 */
export function buildTree<T extends TreeNodeLike>(list: T[]): TreeNode<T>[] {
  const nodeMap = new Map<string, TreeNode<T>>();
  const roots: TreeNode<T>[] = [];

  for (const item of list) {
    nodeMap.set(item.id, { ...item, children: [] });
  }
  for (const item of list) {
    const node = nodeMap.get(item.id) as TreeNode<T>;
    const parent = item.parentId ? nodeMap.get(item.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (nodes: TreeNode<T>[]): void => {
    nodes.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    nodes.forEach((n) => sortRecursive(n.children));
  };
  sortRecursive(roots);
  return roots;
}
