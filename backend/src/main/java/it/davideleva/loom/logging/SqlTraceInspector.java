package it.davideleva.loom.logging;

import org.hibernate.resource.jdbc.spi.StatementInspector;

public class SqlTraceInspector implements StatementInspector {
    private static final ThreadLocal<String> LAST_SQL = new ThreadLocal<>();

    @Override
    public String inspect(String sql) {
        LAST_SQL.set(sql);
        return sql;
    }

    public static String lastSql() {
        return LAST_SQL.get();
    }

    public static void clear() {
        LAST_SQL.remove();
    }
}
