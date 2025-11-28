'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { joinGroup, getGroupByInviteCode } from '@/lib/actions/groups';
import { useAsync } from '@/hooks';
import { toast } from 'sonner';
import { UserPlus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface JoinGroupDialogProps {
  trigger?: React.ReactNode;
}

export function JoinGroupDialog({ trigger }: JoinGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [groupPreview, setGroupPreview] = useState<{
    id: string;
    name: string;
    type: string;
  } | null>(null);
  const router = useRouter();

  const { execute: checkCode, loading: checking } = useAsync(getGroupByInviteCode, {
    onSuccess: (data) => {
      if (data) {
        setGroupPreview(data);
      }
    },
    onError: () => {
      setGroupPreview(null);
      toast.error('Invalid invite code');
    },
  });

  const { execute: join, loading: joining } = useAsync(joinGroup, {
    onSuccess: (data) => {
      toast.success(`Joined ${data?.name} successfully!`);
      setOpen(false);
      setInviteCode('');
      setGroupPreview(null);
      router.push(`/groups/${data?.id}`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  const handleCodeChange = async (value: string) => {
    const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setInviteCode(code);
    
    if (code.length === 8) {
      await checkCode(code);
    } else {
      setGroupPreview(null);
    }
  };

  const handleJoin = async () => {
    if (inviteCode.length === 8) {
      await join(inviteCode);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <UserPlus className="mr-2 h-4 w-4" />
            Join Group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Join a Group</DialogTitle>
          <DialogDescription>
            Enter the invite code shared by your friend to join their group.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="inviteCode">Invite Code</Label>
            <Input
              id="inviteCode"
              placeholder="Enter 8-character code"
              value={inviteCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              maxLength={8}
              className="text-center text-2xl tracking-widest font-mono uppercase"
            />
          </div>

          {groupPreview && (
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{groupPreview.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {groupPreview.type}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false);
              setInviteCode('');
              setGroupPreview(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleJoin}
            disabled={!groupPreview || joining}
          >
            {joining ? 'Joining...' : 'Join Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
