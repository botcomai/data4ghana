const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wynmejzsybkxhqvazjzu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5bm1lanpzeWJreGhxdmF6anp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzU4MzAsImV4cCI6MjA4OTE1MTgzMH0.f9MFrnPZ4ODzJOz71zuWtuCThWO5UUyEv1FkWDEzRiU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
    const { data: roles, error } = await supabase
        .from('users')
        .select('role');
    
    if (error) {
        console.error(error);
        return;
    }

    const counts = roles.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
    }, {});

    console.log(JSON.stringify(counts, null, 2));
}

checkUsers();
